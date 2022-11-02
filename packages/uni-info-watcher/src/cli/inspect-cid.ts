//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { InspectCIDCmd } from '@cerc-io/cli';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:inspect-cid');

const main = async (): Promise<void> => {
  const inspectCIDCmd = new InspectCIDCmd();

  const config = await inspectCIDCmd.initConfig();
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await inspectCIDCmd.init(Database, Indexer, { uniClient, erc20Client });
  await inspectCIDCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
