import fs from 'fs';
import yargs from 'yargs';

import { getTrace } from '../tracing';

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    providerUrl: {
      type: 'string',
      require: true,
      demandOption: true,
      default: 'http://localhost:8545',
      describe: 'ETH JSON-RPC provider URL'
    },
    txHash: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Transaction hash'
    },
    tracer: {
      type: 'string',
      describe: 'The tracer to use'
    },
    tracerFile: {
      type: 'string',
      "describe": 'File with custom tracing JS code'
    }
  }).argv;

  let tracer = argv.tracer;

  const tracerFile = argv.tracerFile;
  if (tracerFile) {
    tracer = fs.readFileSync(tracerFile).toString("utf-8");
  }

  const result = await getTrace(argv.providerUrl, argv.txHash, tracer);

  console.log(JSON.stringify(result, null, 2));
})();
