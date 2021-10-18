//
// Copyright 2021 Vulcanize, Inc.
//

import { resetState } from '@vulcanize/util';
import debug from 'debug';

const log = debug('vulcanize:reset-job-queue');

export const command = 'job-queue';

export const desc = 'Reset job queue';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  await resetState(argv.configFile, argv.blockNumber);

  log('Reset state successfully');
};
