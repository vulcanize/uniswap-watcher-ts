import assert from 'assert';

import { GraphQLClient } from 'graphql-request';

import ethQueries from './eth-queries';
import { Cache } from './cache';

export class EthClient {

  _config: any;
  _client: any;
  _cache: Cache;

  constructor(config) {
    this._config = config;

    // TODO: Config to enable/disable or clear cache on start.

    const { upstream } = config;
    assert(upstream, 'Missing upstream config');
    const { gqlEndpoint } = upstream;
    assert(upstream, 'Missing upstream gqlEndpoint');

    this._cache = new Cache('requests', process.cwd());
    this._client = new GraphQLClient(gqlEndpoint);
  }

  async get(query, vars) {
    return this._getCachedOrFetch(query, vars);
  }

  async _getCachedOrFetch(queryName, vars) {
    const keyObj = {
      queryName,
      vars
    };

    // Check if request cached in db.
    const [value, found] = await this._cache.get(keyObj);
    if (found) {
      return value;
    }

    // Not cached, need to perform an upstream GQL query.
    const result = await this._client.request(ethQueries[queryName], vars);

    // Cache the result and return it.
    await this._cache.put(keyObj, result);

    return result;
  }
}
