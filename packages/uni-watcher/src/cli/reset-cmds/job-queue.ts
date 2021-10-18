//
// Copyright 2021 Vulcanize, Inc.
//

import { cleanJobs } from '@vulcanize/util';
import debug from 'debug';

const log = debug('vulcanize:reset-job-queue');

export const command = 'job-queue';

export const desc = 'Reset job queue';

export const builder = {};

export const handler = async (argv: any): Promise<void> => {
  await cleanJobs(argv.configFile);

  log('Cleaned jobs successfully');
};
