//
// Copyright 2021 Vulcanize, Inc.
//

import { ResetWatcherCmd } from '@cerc-io/cli';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Database } from '../../database';
import { Indexer } from '../../indexer';

export const command = 'watcher';

export const desc = 'Reset watcher to a block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const resetWatcherCmd = new ResetWatcherCmd();

  const config = await resetWatcherCmd.initConfig(argv.configFile);
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await resetWatcherCmd.init(argv, Database, Indexer, { uniClient, erc20Client });

  await resetWatcherCmd.exec();
};
