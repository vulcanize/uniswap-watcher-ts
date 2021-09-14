//
// Copyright 2021 Vulcanize, Inc.
//

import { parse, visit, ParserError } from '@solidity-parser/parser';
import { readFileSync, createWriteStream } from 'fs';
import path from 'path';

import { Visitor } from './visitor';

try {
  const data = readFileSync(path.resolve(__dirname, '../contracts/ERC20_flat.sol')).toString();
  const ast = parse(data);

  const visitor = new Visitor();

  visit(ast, {
    FunctionDefinition: visitor.functionDefinitionVisitor,
    EventDefinition: visitor.eventDefinitionVisitor
  });

  const outStream = createWriteStream('./schema.gql');
  visitor.schema.exportSchema(outStream);
} catch (error) {
  if (error instanceof ParserError) {
    console.log(error.errors);
  }
  console.error(error);
}
