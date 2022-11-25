//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { WatchContractCmd } from '@cerc-io/cli';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Config } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:watch-contract');

const main = async (): Promise<void> => {
  const watchContractCmd = new WatchContractCmd();

  const config: Config = await watchContractCmd.initConfig();
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await watchContractCmd.init(Database, { uniClient, erc20Client });
  await watchContractCmd.initIndexer(Indexer);
  await watchContractCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
