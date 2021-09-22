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
import { exportServer } from './server';
import { exportConfig } from './config';
import { exportArtifacts } from './artifacts';
import { exportPackage } from './package';
import { exportTSConfig } from './tsconfig';

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
    .option('contract-name', {
      alias: 'c',
      demandOption: true,
      describe: 'Main contract name.',
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
  const inputFileName = path.basename(argv['input-file'], '.sol');

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
    outputDir = path.resolve(argv['output-folder']);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const environmentsFolder = path.join(outputDir, 'environments');
    if (!fs.existsSync(environmentsFolder)) fs.mkdirSync(environmentsFolder);

    const artifactsFolder = path.join(outputDir, 'src/artifacts');
    if (!fs.existsSync(artifactsFolder)) fs.mkdirSync(artifactsFolder, { recursive: true });
  }

  let outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/schema.gql'))
    : process.stdout;
  visitor.exportSchema(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/resolvers.ts'))
    : process.stdout;
  visitor.exportResolvers(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/indexer.ts'))
    : process.stdout;
  visitor.exportIndexer(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/server.ts'))
    : process.stdout;
  exportServer(outStream, inputFileName);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'environments/local.toml'))
    : process.stdout;
  exportConfig(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/artifacts/', `${inputFileName}.json`))
    : process.stdout;
  exportArtifacts(
    outStream,
    data,
    `${inputFileName}.sol`,
    argv['contract-name']
  );

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'package.json'))
    : process.stdout;
  exportPackage(path.basename(outputDir), outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'tsconfig.json'))
    : process.stdout;
  exportTSConfig(outStream);
};

main().catch(err => {
  console.error(err);
});
