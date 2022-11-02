//
// Copyright 2022 Vulcanize, Inc.
//

import { CreateCheckpointCmd } from '@cerc-io/cli';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Database } from '../../database';
import { Indexer } from '../../indexer';

export const command = 'create';

export const desc = 'Create checkpoint';

export const builder = {
  address: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Contract address to create the checkpoint for.'
  },
  blockHash: {
    type: 'string',
    describe: 'Blockhash at which to create the checkpoint.'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const createCheckpointCmd = new CreateCheckpointCmd();

  const config = await createCheckpointCmd.initConfig(argv.configFile);
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await createCheckpointCmd.init(argv, Database, Indexer, { uniClient, erc20Client });
  await createCheckpointCmd.exec();
};
