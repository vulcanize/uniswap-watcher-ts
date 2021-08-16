//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import assert from 'assert';
import 'mocha';
import _ from 'lodash';

import {
  getConfig
} from '@vulcanize/util';

import { TestDatabase } from '../test/test-db';
import { createBlockTree, insertDummyToken, removeEntities } from '../test/utils';
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

    // Create BlockProgress test data.
    blocks = await createBlockTree(db);
    tail = blocks[0][0];
    head = blocks[3][10];
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
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //                                       |            /
  //                                      8 Blocks     3 Blocks
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------Token (token00)
  //                                     +---+        (Target)
  //
  it('should fetch Token in pruned region', async () => {
    // Insert a Token entity at the tail.
    const token00 = await insertDummyToken(db, tail);

    const token44 = _.cloneDeep(token00);
    token44.txCount++;
    await insertDummyToken(db, blocks[4][4], token44);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token00.id);
      expect(searchedToken?.txCount).to.be.equal(token00.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token00.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token00.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //           Token (token30)-------\     |            /
  //              (Target)           -\   8 Blocks     3 Blocks
  //                                  -\   |          /
  //                                   -\  |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------Token (token00)
  //                                     +---+
  //
  it('should fetch the Token in frothy region', async () => {
    // Insert a Token entity at tail and in the frothy region.
    const token00 = await insertDummyToken(db, tail);

    const token30 = _.cloneDeep(token00);
    token30.txCount++;
    await insertDummyToken(db, blocks[3][0], token30);

    const token44 = _.cloneDeep(token00);
    token44.txCount++;
    await insertDummyToken(db, blocks[4][4], token44);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token30.id);
      expect(searchedToken?.txCount).to.be.equal(token30.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token30.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token30.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|
  //                                     +---+            +---+
  //                                       |             /
  //           Token (token30)-------\     |            /
  //              (Target)           -\   8 Blocks     3 Blocks
  //                                  -\   |          /
  //                                   -\  |         /
  //                       +---+         +---+  +---+
  //            Token------| 11|         | 11|  | 11|------Token (token40)
  //           (token11)   +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |------Token (token08)
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //

  it('should fetch the Token in frothy region (same block number)', async () => {
    // Insert a Token entity in the frothy region at same block numbers.
    const token08 = await insertDummyToken(db, blocks[0][8]);

    const token11 = _.cloneDeep(token08);
    token11.txCount++;
    await insertDummyToken(db, blocks[1][1], token11);

    const token30 = _.cloneDeep(token08);
    token30.txCount++;
    await insertDummyToken(db, blocks[3][0], token30);

    const token40 = _.cloneDeep(token08);
    token40.txCount++;
    await insertDummyToken(db, blocks[4][0], token40);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token08.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token30.id);
      expect(searchedToken?.txCount).to.be.equal(token30.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token30.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token30.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //                                       |            /
  //                                   8 Blocks     3 Blocks
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //
  it('should not fetch the Token in frothy region', async () => {
    // Insert a Token entity in the frothy region in a side branch.
    const token44 = await insertDummyToken(db, blocks[4][4]);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token44.id, blockHash: head.hash });
      expect(searchedToken).to.be.undefined;

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });
});
