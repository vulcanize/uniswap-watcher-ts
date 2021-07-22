import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial, FindConditions, FindOneOptions, LessThanOrEqual } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { EventSyncProgress } from './entity/EventProgress';
import { Factory } from './entity/Factory';
import { Pool } from './entity/Pool';
import { Event } from './entity/Event';
import { Token } from './entity/Token';
import { Bundle } from './entity/Bundle';
import { PoolDayData } from './entity/PoolDayData';
import { PoolHourData } from './entity/PoolHourData';
import { Transaction } from './entity/Transaction';
import { Mint } from './entity/Mint';
import { UniswapDayData } from './entity/UniswapDayData';
import { Tick } from './entity/Tick';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { Burn } from './entity/Burn';
import { Swap } from './entity/Swap';
import { Position } from './entity/Position';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { BlockProgress } from './entity/BlockProgress';
import { Block } from './events';

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

  async getFactory ({ id, blockNumber }: DeepPartial<Factory>): Promise<Factory | undefined> {
    const repo = this._conn.getRepository(Factory);

    const whereOptions: FindConditions<Factory> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Factory> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getBundle ({ id, blockNumber }: DeepPartial<Bundle>): Promise<Bundle | undefined> {
    const repo = this._conn.getRepository(Bundle);

    const whereOptions: FindConditions<Bundle> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Bundle> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getToken ({ id, blockNumber }: DeepPartial<Token>): Promise<Token | undefined> {
    const repo = this._conn.getRepository(Token);

    const whereOptions: FindConditions<Token> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Token> = {
      where: whereOptions,
      relations: ['whitelistPools', 'whitelistPools.token0', 'whitelistPools.token1'],
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getPool ({ id, blockNumber }: DeepPartial<Pool>): Promise<Pool | undefined> {
    const repo = this._conn.getRepository(Pool);
    const whereOptions: FindConditions<Pool> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Pool> = {
      where: whereOptions,
      relations: ['token0', 'token1'],
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getPosition ({ id, blockNumber }: DeepPartial<Position>): Promise<Position | undefined> {
    const repo = this._conn.getRepository(Position);
    const whereOptions: FindConditions<Position> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Position> = {
      where: whereOptions,
      relations: ['pool', 'token0', 'token1', 'tickLower', 'tickUpper', 'transaction'],
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getTick ({ id, blockNumber }: DeepPartial<Tick>): Promise<Tick | undefined> {
    const repo = this._conn.getRepository(Tick);
    const whereOptions: FindConditions<Tick> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Tick> = {
      where: whereOptions,
      relations: ['pool'],
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getPoolDayData ({ id, blockNumber }: DeepPartial<PoolDayData>): Promise<PoolDayData | undefined> {
    const repo = this._conn.getRepository(PoolDayData);
    const whereOptions: FindConditions<PoolDayData> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<PoolDayData> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getPoolHourData ({ id, blockNumber }: DeepPartial<PoolHourData>): Promise<PoolHourData | undefined> {
    const repo = this._conn.getRepository(PoolHourData);
    const whereOptions: FindConditions<PoolHourData> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<PoolHourData> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getUniswapDayData ({ id, blockNumber }: DeepPartial<UniswapDayData>): Promise<UniswapDayData | undefined> {
    const repo = this._conn.getRepository(UniswapDayData);
    const whereOptions: FindConditions<UniswapDayData> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<UniswapDayData> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getTokenDayData ({ id, blockNumber }: DeepPartial<TokenDayData>): Promise<TokenDayData | undefined> {
    const repo = this._conn.getRepository(TokenDayData);
    const whereOptions: FindConditions<TokenDayData> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<TokenDayData> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getTokenHourData ({ id, blockNumber }: DeepPartial<TokenHourData>): Promise<TokenHourData | undefined> {
    const repo = this._conn.getRepository(TokenHourData);
    const whereOptions: FindConditions<TokenHourData> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<TokenHourData> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getTransaction ({ id, blockNumber }: DeepPartial<Transaction>): Promise<Transaction | undefined> {
    const repo = this._conn.getRepository(Transaction);
    const whereOptions: FindConditions<Transaction> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Transaction> = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getFactories ({ blockNumber }: DeepPartial<Factory>, queryOptions: { [key: string]: any }): Promise<Array<Factory>> {
    const repo = this._conn.getRepository(Factory);

    let selectQueryBuilder = repo.createQueryBuilder('factory')
      .distinctOn(['id'])
      .orderBy('id')
      .addOrderBy('block_number', 'DESC');

    if (blockNumber) {
      selectQueryBuilder = selectQueryBuilder.where('block_number <= :blockNumber', { blockNumber });
    }

    const { limit } = queryOptions;

    if (limit) {
      selectQueryBuilder = selectQueryBuilder.limit(limit);
    }

    return selectQueryBuilder.getMany();
  }

  async saveFactory (factory: Factory, blockNumber: number): Promise<Factory> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Factory);
      factory.blockNumber = blockNumber;
      return repo.save(factory);
    });
  }

  async saveBundle (bundle: Bundle, blockNumber: number): Promise<Bundle> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Bundle);
      bundle.blockNumber = blockNumber;
      return repo.save(bundle);
    });
  }

  async savePool (pool: Pool, blockNumber: number): Promise<Pool> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Pool);
      pool.blockNumber = blockNumber;
      return repo.save(pool);
    });
  }

  async savePoolDayData (poolDayData: PoolDayData, blockNumber: number): Promise<PoolDayData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PoolDayData);
      poolDayData.blockNumber = blockNumber;
      return repo.save(poolDayData);
    });
  }

  async savePoolHourData (poolHourData: PoolHourData, blockNumber: number): Promise<PoolHourData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PoolHourData);
      poolHourData.blockNumber = blockNumber;
      return repo.save(poolHourData);
    });
  }

  async saveToken (token: Token, blockNumber: number): Promise<Token> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Token);
      token.blockNumber = blockNumber;
      return repo.save(token);
    });
  }

  async saveTransaction (transaction: Transaction, blockNumber: number): Promise<Transaction> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Transaction);
      transaction.blockNumber = blockNumber;
      return repo.save(transaction);
    });
  }

  async saveUniswapDayData (uniswapDayData: UniswapDayData, blockNumber: number): Promise<UniswapDayData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(UniswapDayData);
      uniswapDayData.blockNumber = blockNumber;
      return repo.save(uniswapDayData);
    });
  }

  async saveTokenDayData (tokenDayData: TokenDayData, blockNumber: number): Promise<TokenDayData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(TokenDayData);
      tokenDayData.blockNumber = blockNumber;
      return repo.save(tokenDayData);
    });
  }

  async saveTokenHourData (tokenHourData: TokenHourData, blockNumber: number): Promise<TokenHourData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(TokenHourData);
      tokenHourData.blockNumber = blockNumber;
      return repo.save(tokenHourData);
    });
  }

  async saveTick (tick: Tick, blockNumber: number): Promise<Tick> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Tick);
      tick.blockNumber = blockNumber;
      return repo.save(tick);
    });
  }

  async savePosition (position: Position, blockNumber: number): Promise<Position> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Position);
      position.blockNumber = blockNumber;
      return repo.save(position);
    });
  }

  async savePositionSnapshot (positionSnapshot: PositionSnapshot, blockNumber: number): Promise<PositionSnapshot> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PositionSnapshot);
      positionSnapshot.blockNumber = blockNumber;
      return repo.save(positionSnapshot);
    });
  }

  async saveMint (mint: Mint, blockNumber: number): Promise<Mint> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Mint);
      mint.blockNumber = blockNumber;
      return repo.save(mint);
    });
  }

  async saveBurn (burn: Burn, blockNumber: number): Promise<Burn> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Burn);
      burn.blockNumber = blockNumber;
      return repo.save(burn);
    });
  }

  async saveSwap (swap: Swap, blockNumber: number): Promise<Swap> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Swap);
      swap.blockNumber = blockNumber;
      return repo.save(swap);
    });
  }

  // Returns true if events have already been synced for the (block, token) combination.
  async didSyncEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<boolean> {
    const numRows = await this._conn.getRepository(EventSyncProgress)
      .createQueryBuilder()
      .where('block_hash = :blockHash AND token = :token', {
        blockHash,
        token
      })
      .getCount();

    return numRows > 0;
  }

  async getBlockEvents (blockHash: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash', { blockHash })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash AND token = :token', {
        blockHash,
        token
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getEventsByName ({ blockHash, token, eventName }: { blockHash: string, token: string, eventName: string }): Promise<Event[] | undefined> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash AND token = :token AND :eventName = :eventName', {
        blockHash,
        token,
        eventName
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async saveEvents (block: Block, events: DeepPartial<Event>[]): Promise<void> {
    const {
      hash: blockHash,
      number: blockNumber,
      timestamp: blockTimestamp,
      parentHash
    } = block;

    assert(blockHash);
    assert(blockNumber);
    assert(blockTimestamp);
    assert(parentHash);

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the block progress table.
    await this._conn.transaction(async (tx) => {
      const numEvents = events.length;
      const blockProgressRepo = tx.getRepository(BlockProgress);
      let blockProgress = await blockProgressRepo.findOne({ where: { blockHash } });

      if (!blockProgress) {
        const entity = blockProgressRepo.create({
          blockHash,
          parentHash,
          blockNumber,
          blockTimestamp,
          numEvents,
          numProcessedEvents: 0,
          isComplete: (numEvents === 0)
        });

        blockProgress = await blockProgressRepo.save(entity);

        // Bulk insert events.
        events.forEach(event => { event.block = blockProgress; });
        await tx.createQueryBuilder().insert().into(Event).values(events).execute();
      }
    });
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._conn.getRepository(Event).findOne(id, { relations: ['block'] });
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return repo.findOne({ where: { blockHash } });
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
