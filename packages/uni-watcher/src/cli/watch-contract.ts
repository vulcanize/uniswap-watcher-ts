import yargs from 'yargs';
import 'reflect-metadata';
import { watch } from '../utils/index';

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)'
    },
    address: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Address of the deployed contract'
    },
    kind: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Kind of contract (factory|pool|nfpm)'
    },
    startingBlock: {
      type: 'number',
      default: 1,
      describe: 'Starting block'
    }
  }).argv;

  await watch(argv.configFile, argv.address, argv.kind, argv.startingBlock);
})();
