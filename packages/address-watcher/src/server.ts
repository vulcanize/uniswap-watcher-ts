import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { ApolloServer, PubSub } from 'apollo-server-express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';
import { createServer } from 'http';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { TracingClient } from '@vulcanize/tracing-client';

import typeDefs from './schema';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { getConfig } from './config';
import { TxWatcher } from './tx-watcher';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string'
    })
    .argv;

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { host, port } = config.server;

  const { upstream, database: dbConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { gqlEndpoint, gqlSubscriptionEndpoint, traceProviderEndpoint, cache: cacheConfig } = upstream;
  assert(gqlEndpoint, 'Missing upstream gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream gqlSubscriptionEndpoint');
  assert(traceProviderEndpoint, 'Missing upstream traceProviderEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({ gqlEndpoint, gqlSubscriptionEndpoint, cache });

  const tracingClient = new TracingClient(traceProviderEndpoint);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();
  const indexer = new Indexer(db, ethClient, pubsub, tracingClient);

  const txWatcher = new TxWatcher(ethClient, indexer);
  await txWatcher.start();

  const resolvers = await createResolvers(indexer);

  const app: Application = express();
  const server = new ApolloServer({
    typeDefs,
    resolvers
  });

  await server.start();
  server.applyMiddleware({ app });

  const httpServer = createServer(app);
  server.installSubscriptionHandlers(httpServer);

  httpServer.listen(port, host, () => {
    log(`Server is listening on host ${host} port ${port}`);
  });

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
