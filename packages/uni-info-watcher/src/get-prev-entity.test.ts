//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import 'mocha';

import {
  getConfig
} from '@vulcanize/util';

import { TestDatabase } from '../test/test-db';
import { insertDummyBlockProgress, removeDummyBlockProgress, insertDummyToken, removeDummyToken } from '../test/utils';
import { Block } from './events';

describe('getPrevEntityVersion', () => {
  let db: TestDatabase;
  let firstTestBlock: Block;
  let lastTestBlock: Block;

  before(async () => {
    // Get config.
    const configFile = './environments/local.toml';
    const config = await getConfig(configFile);

    const { database: dbConfig } = config;
    assert(dbConfig, 'Missing dbConfig.');

    // Initialize database.
    db = new TestDatabase(dbConfig);
    await db.init();

    // Insert 21 blocks linearly.
    firstTestBlock = await insertDummyBlockProgress(db);
    let block = firstTestBlock;
    for (let i = 0; i < 20; i++) {
      block = await insertDummyBlockProgress(db, block);
    }
    lastTestBlock = block;
  });

  after(async () => {
    await removeDummyBlockProgress(db, firstTestBlock.number);
    db.close();
  });

  afterEach(async () => {
    await removeDummyToken(db, firstTestBlock.number);
  });

  //
  //                     +---+
  //           head----->| 20|
  //                     +---+
  //                         \
  //                          \
  //                           +---+
  //                           | 19|
  //                           +---+
  //                                \
  //                                 \
  //                                  +---+
  //                                  | 18|
  //                                  +---+
  //                                       \
  //                                        \
  //                                         -
  //                                       15 Blocks
  //                                            \
  //                                             \
  //                                              +---+
  //                                              | 2 |
  //                                              +---+
  //                                                   \
  //                                                    \
  //                                                     +---+
  //                                                     | 1 |
  //                                                     +---+
  //                                                          \
  //                                                           \
  //                                                            +---+
  //                                                  tail----->| 0 |------Token
  //                                                            +---+
  //                                                                 \
  //
  it('should fetch Token in pruned region', async () => {
    // Insert Token entity at the firstTestBlock.
    const token = await insertDummyToken(db, firstTestBlock);
    const dbTx = await db.createTransactionRunner();

    try {
      const searchedToken = await db.getToken(dbTx, { id: token.id, blockHash: lastTestBlock.hash });
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
