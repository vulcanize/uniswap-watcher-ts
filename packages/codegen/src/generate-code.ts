//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { flatten } from '@poanet/solidity-flattener';

import { parse, visit } from '@solidity-parser/parser';

import { Visitor } from './visitor';

const MODE_ETH_CALL = 'eth_call';
const MODE_STORAGE = 'storage';

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('input-file', {
      alias: 'i',
      demandOption: true,
      describe: 'Input contract file path or an url.',
      type: 'string'
    })
    .option('output-folder', {
      alias: 'o',
      describe: 'Output folder path.',
      type: 'string'
    })
    .option('mode', {
      alias: 'm',
      describe: 'Code generation mode.',
      type: 'string',
      default: MODE_STORAGE,
      choices: [MODE_ETH_CALL, MODE_STORAGE]
    })
    .option('flatten', {
      alias: 'f',
      describe: 'Flatten the input contract file.',
      type: 'boolean',
      default: true
    })
    .argv;

  let data: string;
  if (argv['input-file'].startsWith('http')) {
    // Assume flattened file in case of URL.
    const response = await fetch(argv['input-file']);
    data = await response.text();
  } else {
    data = argv.flatten
      ? await flatten(path.resolve(argv['input-file']))
      : fs.readFileSync(path.resolve(argv['input-file'])).toString();
  }

  // Get the abstract syntax tree for the flattened contract.
  const ast = parse(data);

  // Filter out library nodes.
  ast.children = ast.children.filter(child => !(child.type === 'ContractDefinition' && child.kind === 'library'));

  const visitor = new Visitor();

  if (argv.mode === MODE_ETH_CALL) {
    visit(ast, {
      FunctionDefinition: visitor.functionDefinitionVisitor.bind(visitor),
      EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
    });
  } else {
    visit(ast, {
      StateVariableDeclaration: visitor.stateVariableDeclarationVisitor.bind(visitor),
      EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
    });
  }

  let outputDir = '';
  if (argv['output-folder']) {
    outputDir = path.resolve(__dirname, argv['output-folder']);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  }

  let outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'schema.gql'))
    : process.stdout;
  visitor.exportSchema(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'resolvers.ts'))
    : process.stdout;
  visitor.exportResolvers(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'indexer.ts'))
    : process.stdout;
  visitor.exportIndexer(outStream);
};

main().catch(err => {
  console.error(err);
});
