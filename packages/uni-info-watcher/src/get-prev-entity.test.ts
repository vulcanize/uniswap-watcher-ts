//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import 'mocha';

import {
  getConfig
} from '@vulcanize/util';

import { TestDatabase } from '../test/test-db';
import { insertDummyBlockProgress, insertDummyToken, removeEntities } from '../test/utils';
import { Block } from './events';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';
import { Token } from './entity/Token';

describe('getPrevEntityVersion', () => {
  let db: TestDatabase;
  let tail: Block;
  let head: Block;
  let isDbEmptyBeforeTest: boolean;

  before(async () => {
    // Get config.
    const configFile = './environments/local.toml';
    const config = await getConfig(configFile);

    const { database: dbConfig } = config;
    assert(dbConfig, 'Missing dbConfig.');

    // Initialize database.
    db = new TestDatabase(dbConfig);
    await db.init();

    // Check if database is empty.
    isDbEmptyBeforeTest = await db.isEmpty();
    assert(isDbEmptyBeforeTest, 'Abort: Database not empty.');

    // Insert 21 blocks linearly.
    tail = await insertDummyBlockProgress(db);
    let block = tail;
    for (let i = 0; i < 20; i++) {
      block = await insertDummyBlockProgress(db, block);
    }
    head = block;
  });

  after(async () => {
    if (isDbEmptyBeforeTest) {
      await removeEntities(db, BlockProgress);
      await removeEntities(db, SyncStatus);
    }
    await db.close();
  });

  afterEach(async () => {
    await removeEntities(db, Token);
  });

  //
  //                     +---+
  //           head----->| 21|
  //                     +---+
  //                         \
  //                          \
  //                           +---+
  //                           | 20|
  //                           +---+
  //                                \
  //                                 \
  //                                  +---+
  //                                  | 19|
  //                                  +---+
  //                                       \
  //                                        \
  //                                         -
  //                                       15 Blocks
  //                                            \
  //                                             \
  //                                              +---+
  //                                              | 3 |
  //                                              +---+
  //                                                   \
  //                                                    \
  //                                                     +---+
  //                                                     | 2 |
  //                                                     +---+
  //                                                          \
  //                                                           \
  //                                                            +---+
  //                                                  tail----->| 1 |------Token
  //                                                            +---+
  //
  it('should fetch Token in pruned region', async () => {
    // Insert a Token entity at the tail.
    const token = await insertDummyToken(db, tail);
    const dbTx = await db.createTransactionRunner();

    try {
      const searchedToken = await db.getToken(dbTx, { id: token.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token.id);
      expect(searchedToken?.txCount).to.be.equal(token.txCount.toString());

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });
});
