//
// Copyright 2021 Vulcanize, Inc.
//

import { cleanJobs, getConfig } from '@vulcanize/util';
import debug from 'debug';

const log = debug('vulcanize:reset-job-queue');

export const command = 'job-queue';

export const desc = 'Reset job queue';

export const builder = {};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await cleanJobs(config);

  log('Cleaned jobs successfully');
};
