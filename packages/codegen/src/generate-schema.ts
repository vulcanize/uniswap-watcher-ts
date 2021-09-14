//
// Copyright 2021 Vulcanize, Inc.
//

import { parse, visit } from '@solidity-parser/parser';
import { readFileSync, createWriteStream } from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Visitor } from './visitor';

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
      default: 'eth_call'
    })
    .argv;

  const data = readFileSync(path.resolve(__dirname, argv['input-file'])).toString();
  const ast = parse(data);

  const visitor = new Visitor();

  visit(ast, {
    FunctionDefinition: visitor.functionDefinitionVisitor,
    EventDefinition: visitor.eventDefinitionVisitor
  });

  const outStream = argv['output-file'] ? createWriteStream(path.resolve(__dirname, argv['output-file'])) : process.stdout;
  visitor.schema.exportSchema(outStream);
};

main().then().catch(err => {
  console.error(err);
});
