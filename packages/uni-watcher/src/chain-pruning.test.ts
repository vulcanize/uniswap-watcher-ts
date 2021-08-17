//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import 'mocha';

import { getConfig } from '@vulcanize/util';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';
import { Database } from './database';
import { createTestBlockTree, removeEntities } from '../test/utils';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';

describe('chain pruning', () => {
  let db: Database;
  let indexer: Indexer;
  let blocks: any[][];
  let tail: any;
  let head: any;
  let isDbEmptyBeforeTest: boolean;

  before(async () => {
    // Get config.
    const configFile = './environments/local.toml';
    const config = await getConfig(configFile);

    const { upstream, database: dbConfig } = config;

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

    // Create BlockProgress test data.
    blocks = await createTestBlockTree(db);
    tail = blocks[0][0];
    head = blocks[0][20];
    expect(tail).to.not.be.empty;
    expect(head).to.not.be.empty;
  });

  after(async () => {
    if (isDbEmptyBeforeTest) {
      await removeEntities(db, BlockProgress);
      await removeEntities(db, SyncStatus);
    }
    await db.close();
  });

  it('should not do anything', () => {
    console.log('empty test');
  });
});
