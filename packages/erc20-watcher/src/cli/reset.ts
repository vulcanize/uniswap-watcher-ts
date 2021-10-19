//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { DEFAULT_CONFIG_PATH } from '@vulcanize/util';

const log = debug('vulcanize:clean-jobs');

const main = async () => {
  return yargs(hideBin(process.argv))
    .parserConfiguration({
      'parse-numbers': false
    }).options({
      configFile: {
        alias: 'f',
        type: 'string',
        require: true,
        demandOption: true,
        describe: 'configuration file path (toml)',
        default: DEFAULT_CONFIG_PATH
      }
    })
    .commandDir('reset-cmds', { extensions: ['ts'] })
    .demandCommand()
    .help()
    .argv;
};

main().then(() => {
  process.exit();
}).catch(err => {
  log(err);
});
