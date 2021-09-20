//
// Copyright 2021 Vulcanize, Inc.
//

const _solToTs: Map<string, string> = new Map();
const _tsToGql: Map<string, string> = new Map();

// TODO Get typemapping from ethersjs.
_solToTs.set('string', 'string');
_solToTs.set('uint8', 'number');
_solToTs.set('uint256', 'bigint');
_solToTs.set('address', 'string');
_solToTs.set('bool', 'boolean');
_solToTs.set('bytes4', 'string');

_tsToGql.set('string', 'String');
_tsToGql.set('number', 'Int');
_tsToGql.set('bigint', 'BigInt');
_tsToGql.set('boolean', 'Boolean');

function getTsForSol (solType: string): string | undefined {
  return _solToTs.get(solType);
}

function getGqlForTs (tsType: string): string | undefined {
  return _tsToGql.get(tsType);
}

export { getTsForSol, getGqlForTs };
