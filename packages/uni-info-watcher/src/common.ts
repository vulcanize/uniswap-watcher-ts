//
// Copyright 2022 Vulcanize, Inc.
//

import { Repository, DeepPartial } from 'typeorm';

export function getLatestEntityFromEntity<Entity> (latestEntityRepo: Repository<Entity>, entity: any): Entity {
  const latestEntityFields = latestEntityRepo.metadata.columns.map(column => column.propertyName);
  return latestEntityRepo.create(_.pick(entity, latestEntityFields) as DeepPartial<Entity>);
}
