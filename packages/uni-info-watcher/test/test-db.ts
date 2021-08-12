//
// Copyright 2021 Vulcanize, Inc.
//

import { QueryRunner, FindConditions } from 'typeorm';

import { Database } from '../src/database';

export class TestDatabase extends Database {
  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions: FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    await repo.remove(entities);
  }
}
