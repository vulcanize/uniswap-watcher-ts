import path from 'path';
import canonicalStringify from 'canonical-json';
import { ethers } from 'ethers';
import level from 'level';

export class Cache {

  _db: any;
  _name: string;

  constructor(name, parentDir) {
    this._db = level(path.join(parentDir, `${name}.db`), { valueEncoding: 'json' });;
    this._name = name;
  }

  key(obj) {
    return this._cacheKey(obj);
  }

  async get(obj) {
    const key = this._cacheKey(obj);

    try {
      const value = await this._db.get(key);

      console.log(`${this._name}: cache hit ${key}`);

      return [value, true];
    } catch (err) {
      console.log(`${this._name}: cache miss ${key}`);

      if (err.notFound) {
        return [undefined, false]
      }
    }
  }

  async put(obj, value) {
    await this._db.put(this._cacheKey(obj), value);
  }

  _cacheKey(obj) {
    return ethers.utils.keccak256(Buffer.from(canonicalStringify(obj)));
  }
}
