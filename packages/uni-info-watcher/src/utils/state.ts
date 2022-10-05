//
// Copyright 2022 Vulcanize, Inc.
//

import { jsonBigIntStringReplacer } from '@cerc-io/util';

export const prepareEntityState = (updatedEntity: any, entityName: string, relationsMap: Map<any, { [key: string]: any }>): any => {
  // Resolve any field name conflicts in the dbData for auto-diff.
  updatedEntity = resolveEntityFieldConflicts(updatedEntity);

  // Prepare the diff data.
  const diffData: any = { state: {} };

  const result = Array.from(relationsMap.entries())
    .find(([key]) => key.name === entityName);

  if (result) {
    // Update entity data if relations exist.
    const [_, relations] = result;

    // Update relation fields for diff data to be similar to GQL query entities.
    Object.entries(relations).forEach(([relation, { type, foreignKey }]) => {
      if (foreignKey || !updatedEntity[relation]) {
        // Field is not present in dbData for derived relations
        return;
      }

      switch (type) {
        case 'many-to-many':
          updatedEntity[relation] = updatedEntity[relation].map((id: string) => ({ id }));
          break;

        case 'one-to-one':
          updatedEntity[relation] = { id: updatedEntity[relation] };
          break;

        default:
      }
    });
  }

  // JSON stringify and parse data for handling unknown types when encoding.
  // For example, decimal.js values are converted to string in the diff data.
  diffData.state[entityName] = {
    // Using custom replacer to store bigints as string values to be encoded by IPLD dag-cbor.
    // TODO: Parse and store as native bigint by using Type encoders in IPLD dag-cbor encode.
    // https://github.com/rvagg/cborg#type-encoders
    [updatedEntity.id]: JSON.parse(JSON.stringify(updatedEntity, jsonBigIntStringReplacer))
  };

  return diffData;
};

const resolveEntityFieldConflicts = (entity: any): any => {
  if (entity) {
    // Remove fields blockHash and blockNumber from the entity.
    delete entity.blockHash;
    delete entity.blockNumber;

    // Rename _blockHash -> blockHash.
    if ('_blockHash' in entity) {
      entity.blockHash = entity._blockHash;
      delete entity._blockHash;
    }

    // Rename _blockNumber -> blockNumber.
    if ('_blockNumber' in entity) {
      entity.blockNumber = entity._blockNumber;
      delete entity._blockNumber;
    }
  }

  return entity;
};
