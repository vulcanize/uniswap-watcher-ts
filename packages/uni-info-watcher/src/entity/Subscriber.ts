//
// Copyright 2022 Vulcanize, Inc.
//

import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import _ from 'lodash';

import { entityToLatestEntityMap } from '../custom-indexer';

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
  // Get latest entity's type
  const entity = event.entity;
  const entityTarget = entityToLatestEntityMap.get(entity.constructor);

  if (!entityTarget) {
    return;
  }

  // Get latest entity's fields to be updated
  const latestEntityRepo = event.manager.getRepository(entityTarget);
  const latestEntityFields = latestEntityRepo.metadata.columns.map(column => column.propertyName);
  const fieldsToUpdate = latestEntityRepo.metadata.columns.map(column => column.databaseName).filter(val => val !== 'id');

  // Create a latest entity instance and upsert in the db
  const latestEntity = event.manager.create(entityTarget, _.pick(entity, latestEntityFields));
  await event.manager.createQueryBuilder()
    .insert()
    .into(entityTarget)
    .values(latestEntity)
    .orUpdate(
      { conflict_target: ['id'], overwrite: fieldsToUpdate }
    )
    .execute();
};
