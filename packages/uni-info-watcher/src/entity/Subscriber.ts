//
// Copyright 2022 Vulcanize, Inc.
//

import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import _ from 'lodash';

import { FrothyEntity } from './FrothyEntity';
import { entityToLatestEntityMap } from '../custom-indexer';
import { ENTITIES } from '../database';
import { getLatestEntityFromEntity } from '../common';

@EventSubscriber()
export class EntitySubscriber implements EntitySubscriberInterface {
  async afterInsert (event: InsertEvent<any>): Promise<void> {
    await afterInsertOrUpdate(event);
  }

  async afterUpdate (event: UpdateEvent<any>): Promise<void> {
    await afterInsertOrUpdate(event);
  }
}

const afterInsertOrUpdate = async (event: InsertEvent<any> | UpdateEvent<any>): Promise<void> => {
  const entity = event.entity;

  // Return if the entity is being pruned
  if (entity.isPruned) {
    return;
  }

  // Insert the entity details in FrothyEntity table
  if (ENTITIES.has(entity.constructor)) {
    const frothyEntity = event.manager.create(
      FrothyEntity,
      {
        ..._.pick(entity, ['id', 'blockHash', 'blockNumber']),
        ...{ name: entity.constructor.name }
      }
    );

    await event.manager.createQueryBuilder()
      .insert()
      .into(FrothyEntity)
      .values(frothyEntity)
      .orIgnore()
      .execute();
  }

  // Get latest entity's type
  const entityTarget = entityToLatestEntityMap.get(entity.constructor);
  if (!entityTarget) {
    return;
  }

  // Get latest entity's fields to be updated
  const latestEntityRepo = event.manager.getRepository(entityTarget);
  const fieldsToUpdate = latestEntityRepo.metadata.columns.map(column => column.databaseName).filter(val => val !== 'id');

  // Create a latest entity instance and upsert in the db
  const latestEntity = getLatestEntityFromEntity(latestEntityRepo, entity);
  await event.manager.createQueryBuilder()
    .insert()
    .into(entityTarget)
    .values(latestEntity as any)
    .orUpdate(
      { conflict_target: ['id'], overwrite: fieldsToUpdate }
    )
    .execute();
};
