import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Event } from './entity/Event';
import { Contract } from './entity/Contract';
import { BlockProgress } from './entity/BlockProgress';

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  async init (): Promise<void> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  // Returns true if events have already been synced for the block.
  async didSyncEvents (blockHash: string): Promise<boolean> {
    const numRows = await this._conn.getRepository(BlockProgress)
      .createQueryBuilder()
      .where('block_hash = :blockHash', { blockHash })
      .getCount();

    return numRows > 0;
  }

  async getBlockEvents (blockHash: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .where('block_hash = :blockHash', { blockHash })
      .addOrderBy('id', 'ASC')
      .getMany();
  }

  async getEvents (blockHash: string, contract: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .where('block_hash = :blockHash AND contract = :contract', {
        blockHash,
        contract
      })
      .addOrderBy('id', 'ASC')
      .getMany();
  }

  async getEventsByName (blockHash: string, contract: string, eventName: string): Promise<Event[] | undefined> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .where('block_hash = :blockHash AND contract = :contract AND event_name = :eventName', {
        blockHash,
        contract,
        eventName
      })
      .getMany();
  }

  async saveEvents (blockHash: string, events: DeepPartial<Event>[]): Promise<void> {
    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the event progress table.

    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Event);

      // Check sync progress inside the transaction.
      const numRows = await repo
        .createQueryBuilder()
        .where('block_hash = :blockHash', { blockHash })
        .getCount();

      if (numRows === 0) {
        // Bulk insert events.
        await tx.createQueryBuilder()
          .insert()
          .into(Event)
          .values(events)
          .execute();
      }
    });
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._conn.getRepository(Event).findOne(id);
  }

  async getContract (address: string): Promise<Contract | undefined> {
    return this._conn.getRepository(Contract)
      .createQueryBuilder('contract')
      .where('address = :address', { address })
      .getOne();
  }

  async saveContract (address: string, kind: string, startingBlock: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Contract);

      const numRows = await repo
        .createQueryBuilder()
        .where('address = :address', { address })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ address, kind, startingBlock });
        await repo.save(entity);
      }
    });
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return repo.findOne({ where: { blockHash } });
  }

  async initBlockProgress (blockHash: string, blockNumber: number, numEvents: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(BlockProgress);

      const numRows = await repo
        .createQueryBuilder()
        .where('block_hash = :blockHash', { blockHash })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ blockHash, blockNumber, numEvents, numProcessedEvents: 0, isComplete: (numEvents === 0) });
        await repo.save(entity);
      }
    });
  }

  async updateBlockProgress (blockHash: string): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(BlockProgress);
      const entity = await repo.findOne({ where: { blockHash } });
      if (entity && !entity.isComplete) {
        entity.numProcessedEvents++;
        if (entity.numProcessedEvents >= entity.numEvents) {
          entity.isComplete = true;
        }
        await repo.save(entity);
      }
    });
  }
}
