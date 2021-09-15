//
// Copyright 2021 Vulcanize, Inc.
//

import { readFileSync } from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { parse, visit } from '@solidity-parser/parser';

import { Visitor } from './visitor';

const MODE_ETH_CALL = 'eth_call';
const MODE_STORAGE = 'storage';

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('input-file', {
      alias: 'i',
      demandOption: true,
      describe: 'Input contract file path.',
      type: 'string'
    })
    .option('output-file', {
      alias: 'o',
      describe: 'Schema output file path.',
      type: 'string'
    })
    .option('mode', {
      alias: 'm',
      type: 'string',
      default: MODE_ETH_CALL,
      choices: [MODE_ETH_CALL, MODE_STORAGE]
    })
    .argv;

  const data = readFileSync(path.resolve(argv['input-file'])).toString();
  const ast = parse(data);

  const visitor = new Visitor();

  visit(ast, {
    FunctionDefinition: visitor.functionDefinitionVisitor.bind(visitor),
    EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
  });

  visitor.exportSchema(argv['output-file']);
};

main().catch(err => {
  console.error(err);
});
