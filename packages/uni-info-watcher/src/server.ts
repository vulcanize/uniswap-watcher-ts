//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';
import 'graphql-import-node';

import { ServerCmd } from '@cerc-io/cli';
import { Config } from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import typeDefs from './schema';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();

  const config: Config = await serverCmd.initConfig();
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await serverCmd.init(Database, Indexer, EventWatcher, { uniClient, erc20Client });

  return process.env.MOCK ? serverCmd.exec(createMockResolvers, typeDefs) : serverCmd.exec(createResolvers, typeDefs);
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
