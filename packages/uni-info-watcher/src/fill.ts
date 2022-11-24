//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { FillCmd } from '@cerc-io/cli';
import { Config } from '@vulcanize/util';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';

import { Database, ENTITIES } from './database';
import { Indexer } from './indexer';
import { EventWatcher } from './events';
import { FACTORY_ADDRESS } from './utils/constants';

const log = debug('vulcanize:fill');

export const main = async (): Promise<any> => {
  const fillCmd = new FillCmd();

  const config: Config = await fillCmd.initConfig();
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await fillCmd.init(Database, Indexer, EventWatcher, { uniClient, erc20Client });

  await fillCmd.exec(_getContractEntitiesMap());
};

const _getContractEntitiesMap = (): Map<string, string[]> => {
  // Map: contractAddress -> entity names
  // Using Factory contract to store state for all entities.
  const entityNames = [...ENTITIES].map(entity => entity.name);
  return new Map([
    [
      FACTORY_ADDRESS,
      entityNames
    ]
  ]);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
