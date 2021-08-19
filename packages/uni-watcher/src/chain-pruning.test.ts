//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import 'mocha';

import { getConfig, JobQueue, JobRunner } from '@vulcanize/util';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { insertNDummyBlocks } from '@vulcanize/util/test';

import { Indexer } from './indexer';
import { Database } from './database';
import { removeEntities } from '../test/utils';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';

describe('chain pruning', () => {
  let db: Database;
  let indexer: Indexer;
  let jobRunner: JobRunner;
  let isDbEmptyBeforeTest: boolean;

  before(async () => {
    // Get config.
    const configFile = './environments/local.toml';
    const config = await getConfig(configFile);

    const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

    assert(dbConfig, 'Missing database config');

    // Initialize database.
    db = new Database(dbConfig);
    await db.init();

    // Check if database is empty.
    const isBlockProgressEmpty = await db.isEntityEmpty(BlockProgress);
    const isSyncStatusEmpty = await db.isEntityEmpty(SyncStatus);
    isDbEmptyBeforeTest = isBlockProgressEmpty && isSyncStatusEmpty;

    assert(isDbEmptyBeforeTest, 'Abort: Database not empty.');

    // Create an Indexer object.
    assert(upstream, 'Missing upstream config');
    const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint }, cache: cacheConfig } = upstream;
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
    assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');

    const cache = await getCache(cacheConfig);
    const ethClient = new EthClient({
      gqlEndpoint: gqlApiEndpoint,
      gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
      cache
    });

    const postgraphileClient = new EthClient({
      gqlEndpoint: gqlPostgraphileEndpoint,
      cache
    });

    indexer = new Indexer(config, db, ethClient, postgraphileClient);
    assert(indexer, 'Could not create indexer object.');

    const jobQueue = new JobQueue(jobQueueConfig);

    jobRunner = new JobRunner(indexer, jobQueue);
  });

  afterEach(async () => {
    if (isDbEmptyBeforeTest) {
      await removeEntities(db, BlockProgress);
      await removeEntities(db, SyncStatus);
    }
  });

  after(async () => {
    await db.close();
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 20|
  //                                     +---+
  //                                       |
  //                                       |
  //                                    14 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 6 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 5 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 4 |<------Block to be pruned
  //                                     +---+
  //                                       |
  //                                       |
  //                                   2 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //
  it('should prune a block in chain without branches', async () => {
    // Create BlockProgress test data.
    await insertNDummyBlocks(db, 21);
    const pruneBlockHeight = 4;

    // Should return only one block as there are no branches.
    const blocks = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocks).to.have.lengthOf(1);

    const job = { data: { pruneBlockHeight } };
    await jobRunner.pruneChain(job);

    // Only one canonical (not pruned) block should exist at the pruned height.
    const blocksAfterPruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksAfterPruning).to.have.lengthOf(1);
  });
});
