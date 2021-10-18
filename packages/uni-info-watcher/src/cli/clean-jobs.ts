//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { cleanJobs } from '@vulcanize/util';

const log = debug('vulcanize:clean-jobs');

cleanJobs().then(() => {
  process.exit();
}).catch(err => {
  log(err);
});
