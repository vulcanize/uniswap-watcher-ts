//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'mocha';

import {
  getConfig
} from '@vulcanize/util';

import { TestDatabase } from '../test/test-db';
import { insertDummyBlockProgress, removeDummyBlockProgress } from '../test/utils';

describe('getPrevEntityVersion', () => {
  let db: TestDatabase;

  before(async () => {
    // Get config.
    const configFile = './environments/local.toml';
    const config = await getConfig(configFile);

    const { database: dbConfig } = config;
    assert(dbConfig, 'Missing dbConfig.');

    // Initialize database.
    db = new TestDatabase(dbConfig);
    await db.init();

    await insertDummyBlockProgress(db);
  });

  after(async () => {
    await removeDummyBlockProgress(db);
    db.close();
  });

  it('should do nothing', () => {
    console.log('empty test');
  });
});
