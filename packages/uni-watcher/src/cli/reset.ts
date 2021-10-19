//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { getResetYargs } from '@vulcanize/util';

const log = debug('vulcanize:clean-jobs');

const main = async () => {
  return getResetYargs()
    .commandDir('reset-cmds', { extensions: ['ts'] })
    .demandCommand()
    .help();
};

main().then(() => {
  process.exit();
}).catch(err => {
  log(err);
});
