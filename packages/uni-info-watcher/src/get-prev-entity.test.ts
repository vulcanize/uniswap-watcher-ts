//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import assert from 'assert';
import 'mocha';

import {
  getConfig
} from '@vulcanize/util';

import { TestDatabase } from '../test/test-db';
import { createBPStructure, getSampleToken, insertDummyToken, removeEntities } from '../test/utils';
import { Block } from './events';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';
import { Token } from './entity/Token';

describe('getPrevEntityVersion', () => {
  let db: TestDatabase;
  let blocks: Block[][];
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

    // Create the BlockProgress test data.
    blocks = await createBPStructure(db);
    tail = blocks[0][0];
    head = blocks[2][10];
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
  //                    +---+
  //          head----->| 21|
  //                    +---+
  //                         \
  //                          \
  //                           +---+                              +---+
  //                           | 20|                              | 15|
  //                           +---+                              +---+
  //                                \                            /
  //                                 \                          /
  //                                8 Blocks                3 Blocks
  //                                    \                     /
  //                                     \                   /
  //                                      +---+         +---+
  //                                      | 11|         | 11|
  //                                      +---+         +---+
  //                                           \       /
  //                                            \     /
  //                                             +---+
  //                                             | 10|
  //                                             +---+
  //                                                  \
  //                                                   \
  //                                                    +---+
  //                                                    | 9 |
  //                                                    +---+
  //                                                         \
  //                                                          \
  //                                                        7 Blocks
  //                                                            \
  //                                                             \
  //                                                              ----+
  //                                                    tail----->| 1 |------Token
  //                                                              +---+
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
      expect(searchedToken?.blockNumber).to.be.equal(token.blockNumber);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                    +---+
  //          head----->| 21|
  //                    +---+
  //                         \
  //                          \
  //                           +---+                              +---+
  //                           | 20|                              | 15|------Token
  //                           +---+                              +---+
  //                                \                            /
  //                                 \                          /
  //                                8 Blocks                3 Blocks
  //                                    \                     /
  //                                     \                   /
  //                                      +---+         +---+
  //                                      | 11|         | 11|
  //                                      +---+         +---+
  //                                           \       /
  //                                            \     /
  //                                             +---+
  //                                             | 10|
  //                                             +---+
  //                                                  \
  //                                                   \
  //                                                    +---+
  //                                                    | 9 |------Token
  //                                                    +---+
  //                                                         \
  //                                                          \
  //                                                        7 Blocks
  //                                                            \
  //                                                             \
  //                                                              ----+
  //                                                    tail----->| 1 |------Token
  //                                                              +---+
  //
  it('should fetch the latest Token instance in frothy region', async () => {
    // Insert a Token entity at tail and in the frothy region.
    const token00 = await insertDummyToken(db, tail);

    const token08 = getSampleToken();
    Object.assign(token08, token00);
    token08.txCount++;
    await insertDummyToken(db, blocks[0][8], token08);

    const token14 = getSampleToken();
    Object.assign(token14, token08);
    token14.txCount++;
    await insertDummyToken(db, blocks[1][4], token14);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token08.id);
      expect(searchedToken?.txCount).to.be.equal(token08.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token08.blockNumber);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });
});
