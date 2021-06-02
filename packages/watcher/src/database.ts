import assert from "assert";
import { Connection } from "typeorm";

import { Allowance } from "./entity/Allowance";
import { Balance } from "./entity/Balance";
import { Event } from "./entity/Event";
import { EventSyncProgress } from "./entity/EventProgress";

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

  async saveBalance({ blockHash, token, owner, value, proof }) {
    const repo = this._db.getRepository(Balance);
    const entity = repo.create({ blockHash, token, owner, value, proof });
    return repo.save(entity);
  }

  async saveAllowance({ blockHash, token, owner, spender, value, proof }) {
    const repo = this._db.getRepository(Allowance);
    const entity = repo.create({ blockHash, token, owner, spender, value, proof });
    return repo.save(entity);
  }

  // Returns try if events have already been synced for the (block, token) combination.
  async didSyncEvents({ blockHash, token }) {
    const numRows = await this._db.getRepository(EventSyncProgress)
      .createQueryBuilder()
      .where("blockHash = :blockHash AND token = :token", {
        blockHash,
        token,
      })
      .getCount();

    return numRows > 0;
  }

  async saveEventSyncProgress({ blockHash, token }) {
    const repo = this._db.getRepository(EventSyncProgress);
    const entity = repo.create({ blockHash, token });
    return repo.save(entity);
  }

  async getEvents({ blockHash, token }) {
    return this._db.getRepository(Event)
      .createQueryBuilder("event")
      .where("blockHash = :blockHash AND token = :token", {
        blockHash,
        token,
      })
      .getMany();
  }

  async getEventsByName({ blockHash, token, eventName }) {
    return this._db.getRepository(Event)
      .createQueryBuilder("event")
      .where("blockHash = :blockHash AND token = :token AND :eventName = :eventName", {
        blockHash,
        token,
        eventName
      })
      .getMany();
  }
}
