import assert from "assert";
import { Connection } from "typeorm";
import { Allowance } from "./entity/Allowance";
import { Balance } from "./entity/Balance";

export class Database {

  _db: Connection

  constructor(db) {
    assert(db);
    this._db = db;
  }

  async getBalance({ blockHash, token, owner }) {
    return this._db.getRepository(Balance)
      .createQueryBuilder("balance")
      .where("blockHash = :blockHash AND token = :token AND owner = :owner", {
        blockHash,
        token,
        owner
      })
      .getOne();
  }

  async getAllowance({ blockHash, token, owner, spender }) {
    return this._db.getRepository(Allowance)
      .createQueryBuilder("allowance")
      .where("blockHash = :blockHash AND token = :token AND owner = :owner AND spender = :spender", {
        blockHash,
        token,
        owner,
        spender
      })
      .getOne();
  }

  async createBalance({ blockHash, token, owner, value, proof }) {
    const repo = this._db.getRepository(Balance);
    const entity = repo.create({ blockHash, token, owner, value, proof });
    return repo.save(entity);
  }

  async createAllowance({ blockHash, token, owner, spender, value, proof }) {
    const repo = this._db.getRepository(Allowance);
    const entity = repo.create({ blockHash, token, owner, spender, value, proof });
    return repo.save(entity);
  }
}