//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

import { ServerCmd } from '@cerc-io/cli';

import typeDefs from './schema';
import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer, EventWatcher);

  return serverCmd.exec(createResolvers, typeDefs);
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
