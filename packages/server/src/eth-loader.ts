import assert from 'assert';
import canonicalStringify from 'canonical-json';
import { ethers } from 'ethers';
import { GraphQLClient } from 'graphql-request';
import level from 'level';

import ethQueries from './eth-queries';

const dbKey = keyObj => ethers.utils.keccak256(Buffer.from(canonicalStringify(keyObj)));

const dbPut = async (db, keyObj, value) => {
  await db.put(dbKey(keyObj), value);
};

const dbGet = async (db, keyObj) => {
  const key = dbKey(keyObj);

  try {
    const value = await db.get(key);

    console.log("request cache hit", key);

    return [value, true];
  } catch (err) {
    console.log("request cache miss", key);

    if (err.notFound) {
      return [undefined, false]
    }
  }
};

export const getCachedOrFetch = async (db, client, queryName, vars) => {
  const keyObj = {
    queryName,
    vars
  };

  // Check if request cached in db.
  const [value, found] = await dbGet(db, keyObj);
  if (found) {
    return value;
  }

  // Not cached, need to perform an upstream GQL query.
  const result = await client.request(ethQueries[queryName], vars);

  // Cache the result and return it.
  await dbPut(db, keyObj, result);

  return result;
};

export class EthLoader {

  _config: any;
  _db: any;
  _client: any;

  constructor(config) {
    this._config = config;

    // TODO: Config to enable/disable or clear cache on start.

    const { upstream } = config;
    assert(upstream, 'Missing upstream config');
    const { gqlEndpoint } = upstream;
    assert(upstream, 'Missing upstream gqlEndpoint');

    this._db = level('requests.db', { valueEncoding: 'json' });
    this._client = new GraphQLClient(gqlEndpoint);
  }

  async get (query, vars) {
    return getCachedOrFetch(this._db, this._client, query, vars);
  }
}