//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';
import WebSocket from 'ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { PubSub } from 'graphql-subscriptions';
import responseCachePlugin from 'apollo-server-plugin-response-cache';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';
import { createServer } from 'http';
import queue from 'express-queue';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { DEFAULT_CONFIG_PATH } from '@cerc-io/util';

import { getConfig, getCustomProvider, JobQueue, startGQLMetricsServer } from '@vulcanize/util';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';

import typeDefs from './schema';

import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';
import { CustomIndexer } from './custom-indexer';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string',
      default: DEFAULT_CONFIG_PATH
    })
    .argv;

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { host, port, maxSimultaneousRequests, maxRequestQueueLimit } = config.server;

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig, config.server);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const {
    ethServer: {
      gqlApiEndpoint,
      rpcProviderEndpoint
    },
    uniWatcher,
    tokenWatcher,
    cache: cacheConfig
  } = upstream;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);
  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, uniClient, erc20Client, ethClient, ethProvider, jobQueue);

  const pubSub = new PubSub();
  const eventWatcher = new EventWatcher(upstream, ethClient, indexer, pubSub, jobQueue);
  // Delete jobs to prevent creating jobs after completion of processing previous block.
  await jobQueue.deleteAllJobs();
  await eventWatcher.start();

  const customIndexer = new CustomIndexer(config, db, indexer);
  const resolvers = process.env.MOCK ? await createMockResolvers() : await createResolvers(indexer, customIndexer, eventWatcher);

  // Create an Express app and HTTP server
  const app: Application = express();
  app.use(queue({ activeLimit: maxSimultaneousRequests || 1, queuedLimit: maxRequestQueueLimit || -1 }));
  const httpServer = createServer(app);

  // Create the schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create our WebSocket server using the HTTP server we just set up.
  const wsServer = new WebSocket.Server({
    server: httpServer,
    path: '/graphql'
  });
  const serverCleanup = useServer({ schema }, wsServer);

  const server = new ApolloServer({
    schema,
    csrfPrevention: true,
    cache: 'bounded',
    plugins: [
      // Proper shutdown for the HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server
      {
        async serverWillStart () {
          return {
            async drainServer () {
              await serverCleanup.dispose();
            }
          };
        }
      },
      responseCachePlugin()]
  });
  await server.start();
  server.applyMiddleware({ app });

  httpServer.listen(port, host, () => {
    log(`Server is listening on ${host}:${port}${server.graphqlPath}`);
  });

  await startGQLMetricsServer(config);

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
