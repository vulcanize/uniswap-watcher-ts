//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial, FindConditions, In, QueryRunner, Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import _ from 'lodash';

import { BlockProgressInterface, EventInterface, SyncStatusInterface } from './types';

const UNKNOWN_EVENT_NAME = '__unknown__';

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  async init (): Promise<Connection> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });

    return this._conn;
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    const queryRunner = this._conn.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    return queryRunner;
  }

  async getSyncStatus (repo: Repository<SyncStatusInterface>): Promise<SyncStatusInterface | undefined> {
    return repo.findOne();
  }

  async updateSyncStatusIndexedBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (blockNumber >= entity.latestIndexedBlockNumber) {
      entity.latestIndexedBlockHash = blockHash;
      entity.latestIndexedBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusCanonicalBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (blockNumber >= entity.latestCanonicalBlockNumber) {
      entity.latestCanonicalBlockHash = blockHash;
      entity.latestCanonicalBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusChainHead (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    let entity = await repo.findOne();
    if (!entity) {
      entity = repo.create({
        chainHeadBlockHash: blockHash,
        chainHeadBlockNumber: blockNumber,
        latestCanonicalBlockHash: blockHash,
        latestCanonicalBlockNumber: blockNumber,
        latestIndexedBlockHash: '',
        latestIndexedBlockNumber: -1
      });
    }

    if (blockNumber >= entity.chainHeadBlockNumber) {
      entity.chainHeadBlockHash = blockHash;
      entity.chainHeadBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async getBlockProgress (repo: Repository<BlockProgressInterface>, blockHash: string): Promise<BlockProgressInterface | undefined> {
    return repo.findOne({ where: { blockHash } });
  }

  async getBlocksAtHeight (repo: Repository<BlockProgressInterface>, height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return repo.createQueryBuilder('block_progress')
      .where('block_number = :height AND is_pruned = :isPruned', { height, isPruned })
      .getMany();
  }

  async updateBlockProgress (repo: Repository<BlockProgressInterface>, blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    const entity = await repo.findOne({ where: { blockHash } });
    if (entity && !entity.isComplete) {
      if (lastProcessedEventIndex <= entity.lastProcessedEventIndex) {
        throw new Error(`Events processed out of order ${blockHash}, was ${entity.lastProcessedEventIndex}, got ${lastProcessedEventIndex}`);
      }

      entity.lastProcessedEventIndex = lastProcessedEventIndex;
      entity.numProcessedEvents++;
      if (entity.numProcessedEvents >= entity.numEvents) {
        entity.isComplete = true;
      }

      await repo.save(entity);
    }
  }

  async markBlocksAsPruned (repo: Repository<BlockProgressInterface>, blocks: BlockProgressInterface[]): Promise<void> {
    const ids = blocks.map(({ id }) => id);

    await repo.update({ id: In(ids) }, { isPruned: true });
  }

  async getEvent (repo: Repository<EventInterface>, id: string): Promise<EventInterface | undefined> {
    return repo.findOne(id, { relations: ['block'] });
  }

  async getBlockEvents (repo: Repository<EventInterface>, blockHash: string): Promise<EventInterface[]> {
    return repo.createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash', { blockHash })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async saveEvents (blockRepo: Repository<BlockProgressInterface>, eventRepo: Repository<EventInterface>, block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<void> {
    const {
      blockHash,
      blockNumber,
      blockTimestamp,
      parentHash
    } = block;

    assert(blockHash);
    assert(blockNumber);
    assert(blockTimestamp);
    assert(parentHash);

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the block progress table.
    const numEvents = events.length;
    let blockProgress = await blockRepo.findOne({ where: { blockHash } });

    if (!blockProgress) {
      const entity = blockRepo.create({
        blockHash,
        parentHash,
        blockNumber,
        blockTimestamp,
        numEvents,
        numProcessedEvents: 0,
        lastProcessedEventIndex: -1,
        isComplete: (numEvents === 0)
      });

      blockProgress = await blockRepo.save(entity);

      // Bulk insert events.
      events.forEach(event => {
        event.block = blockProgress;
      });

      await eventRepo.createQueryBuilder().insert().values(events).execute();
    }
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    return entities;
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      await queryRunner.connect();
      const data = await this.getEntities(queryRunner, entity);

      if (data.length > 0) {
        return false;
      }

      return true;
    } finally {
      await queryRunner.release();
    }
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    await repo.remove(entities);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          block_hash,
          block_number,
          parent_hash,
          0 as depth
        FROM
          block_progress
        WHERE
          block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1
          FROM
            block_progress b
          INNER JOIN
            cte_query c ON c.parent_hash = b.block_hash
          WHERE
            c.depth < $2
      )
      SELECT
        block_hash, block_number
      FROM
        cte_query
      ORDER BY block_number ASC
      LIMIT 1;
    `;

    // Get ancestor block hash using heirarchical query.
    const [{ block_hash: ancestorBlockHash }] = await this._conn.query(heirerchicalQuery, [blockHash, depth]);

    return ancestorBlockHash;
  }

  async getProcessedBlockCountForRange (repo: Repository<BlockProgressInterface>, fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const blockNumbers = _.range(fromBlockNumber, toBlockNumber + 1);
    const expected = blockNumbers.length;

    const { count: actual } = await repo
      .createQueryBuilder('block_progress')
      .select('COUNT(DISTINCT(block_number))', 'count')
      .where('block_number IN (:...blockNumbers) AND is_complete = :isComplete', { blockNumbers, isComplete: true })
      .getRawOne();

    return { expected, actual: parseInt(actual) };
  }

  async getEventsInRange (repo: Repository<EventInterface>, fromBlockNumber: number, toBlockNumber: number): Promise<Array<EventInterface>> {
    const events = repo.createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_number >= :fromBlockNumber AND block_number <= :toBlockNumber AND event_name <> :eventName', {
        fromBlockNumber,
        toBlockNumber,
        eventName: UNKNOWN_EVENT_NAME
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();

    return events;
  }

  async saveEventEntity (repo: Repository<EventInterface>, entity: EventInterface): Promise<EventInterface> {
    return await repo.save(entity);
  }
}
