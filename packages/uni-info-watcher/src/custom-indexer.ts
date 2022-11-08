//
// Copyright 2022 Vulcanize, Inc.
//

import { SelectionNode } from 'graphql';
import assert from 'assert';
import { QueryRunner, Repository, SelectQueryBuilder } from 'typeorm';

import { OPERATOR_MAP, Config, QueryOptions, Where } from '@cerc-io/util';
import { ENTITY_QUERY_TYPE, resolveEntityFieldConflicts } from '@cerc-io/graph-node';

import { Indexer } from './indexer';
import { Database, DEFAULT_LIMIT, ENTITY_QUERY_TYPE_MAP } from './database';
import { Pool } from './entity/Pool';
import { LatestPool } from './entity/LatestPool';
import { Token } from './entity/Token';
import { LatestToken } from './entity/LatestToken';
import { UniswapDayData } from './entity/UniswapDayData';
import { LatestUniswapDayData } from './entity/LatestUniswapDayData';

export const entityToLatestEntityMap: Map<any, any> = new Map();
entityToLatestEntityMap.set(Pool, LatestPool);
entityToLatestEntityMap.set(Token, LatestToken);
entityToLatestEntityMap.set(UniswapDayData, LatestUniswapDayData);

export class CustomIndexer {
  _config: Config;
  _db: Database;
  _indexer: Indexer;

  constructor (config: Config, db: Database, indexer: Indexer) {
    this._config = config;
    this._db = db;
    this._indexer = indexer;
  }

  async getLatestEntities<Entity> (
    entity: new () => Entity,
    where: { [key: string]: any } = {},
    queryOptions: QueryOptions,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      where = this._indexer.getGQLToDBFilter(where);

      if (!queryOptions.limit) {
        queryOptions.limit = DEFAULT_LIMIT;
      }

      res = await this.getEntities(dbTx, entity, this._db.relationsMap, where, queryOptions, selections);
      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getEntities<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    relationsMap: Map<any, { [key: string]: any }>,
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    let entities: Entity[];
    const latestEntity = entityToLatestEntityMap.get(entity);

    if (latestEntity) {
      // Use latest entity tables for Pool and Token.
      entities = await this.getDBLatestEntities(
        queryRunner,
        entity,
        latestEntity,
        where,
        queryOptions
      );
    } else {
      // Use different suitable query patterns based on entities.
      switch (ENTITY_QUERY_TYPE_MAP.get(entity)) {
        case ENTITY_QUERY_TYPE.SINGULAR:
          entities = await this._db.graphDatabase.getEntitiesSingular(queryRunner, entity, {}, where);
          break;

        case ENTITY_QUERY_TYPE.UNIQUE:
          entities = await this._db.graphDatabase.getEntitiesUnique(queryRunner, entity, {}, where, queryOptions);
          break;

        case ENTITY_QUERY_TYPE.DISTINCT_ON:
          entities = await this._db.graphDatabase.getEntitiesDistinctOn(queryRunner, entity, {}, where, queryOptions);
          break;

        case ENTITY_QUERY_TYPE.DISTINCT_ON_WITHOUT_PRUNED:
          entities = await this._db.graphDatabase.getEntitiesDistinctOnWithoutPruned(queryRunner, entity, {}, where, queryOptions);
          break;

        case ENTITY_QUERY_TYPE.GROUP_BY_WITHOUT_PRUNED:
          // Use group by query if entity query type is not specified in map.
          entities = await this._db.graphDatabase.getEntitiesGroupByWithoutPruned(queryRunner, entity, {}, where, queryOptions);
          break;

        case ENTITY_QUERY_TYPE.GROUP_BY:
        default:
          // Use group by query if entity query type is not specified in map.
          entities = await this._db.graphDatabase.getEntitiesGroupBy(queryRunner, entity, {}, where, queryOptions);
          break;
      }
    }

    if (!entities.length) {
      return [];
    }

    entities = await this.loadLatestEntitiesRelations(queryRunner, relationsMap, entity, entities, selections);
    // Resolve any field name conflicts in the entity result.
    entities = entities.map(entity => resolveEntityFieldConflicts(entity));

    return entities;
  }

  async getDBLatestEntities<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    latestEntity: new () => any,
    where: Where = {},
    queryOptions: QueryOptions = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);
    const { tableName } = repo.metadata;

    let selectQueryBuilder = repo.createQueryBuilder(tableName)
      .innerJoin(
        latestEntity,
        'latest',
        `latest.id = ${tableName}.id AND latest.blockHash = ${tableName}.blockHash`
      );

    selectQueryBuilder = this.buildQuery(repo, selectQueryBuilder, where, 'latest');

    if (queryOptions.orderBy) {
      selectQueryBuilder = this.orderQuery(repo, selectQueryBuilder, queryOptions, 'latest');
    }

    selectQueryBuilder = this.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' }, 'latest');

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    return selectQueryBuilder.getMany();
  }

  async loadLatestEntitiesRelations<Entity> (
    queryRunner: QueryRunner,
    relationsMap: Map<any, { [key: string]: any }>,
    entity: new () => Entity,
    entities: Entity[],
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const relations = relationsMap.get(entity);
    if (relations === undefined) {
      return entities;
    }

    const relationSelections = selections.filter((selection) => selection.kind === 'Field' && Boolean(relations[selection.name.value]));

    for (const selection of relationSelections) {
      assert(selection.kind === 'Field');
      const field = selection.name.value;
      const { entity: relationEntity, isArray, isDerived, field: foreignKey } = relations[field];
      let childSelections = selection.selectionSet?.selections || [];

      // Filter out __typename field in GQL for loading relations.
      childSelections = childSelections.filter(selection => !(selection.kind === 'Field' && selection.name.value === '__typename'));

      if (isDerived) {
        const where: Where = {
          [foreignKey]: [{
            value: entities.map((entity: any) => entity.id),
            not: false,
            operator: 'in'
          }]
        };

        const relatedEntities = await this.getEntities(
          queryRunner,
          relationEntity,
          relationsMap,
          where,
          {},
          childSelections
        );

        const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any[]}, entity: any) => {
          // Related entity might be loaded with data.
          const parentEntityId = entity[foreignKey].id ?? entity[foreignKey];

          if (!acc[parentEntityId]) {
            acc[parentEntityId] = [];
          }

          if (acc[parentEntityId].length < DEFAULT_LIMIT) {
            acc[parentEntityId].push(entity);
          }

          return acc;
        }, {});

        entities.forEach((entity: any) => {
          if (relatedEntitiesMap[entity.id]) {
            entity[field] = relatedEntitiesMap[entity.id];
          } else {
            entity[field] = [];
          }
        });

        continue;
      }

      if (isArray) {
        const relatedIds = entities.reduce((acc: Set<string>, entity: any) => {
          entity[field].forEach((relatedEntityId: string) => acc.add(relatedEntityId));

          return acc;
        }, new Set());

        const where: Where = {
          id: [{
            value: Array.from(relatedIds),
            not: false,
            operator: 'in'
          }]
        };

        const relatedEntities = await this.getEntities(
          queryRunner,
          relationEntity,
          relationsMap,
          where,
          {},
          childSelections
        );

        entities.forEach((entity: any) => {
          const relatedEntityIds: Set<string> = entity[field].reduce((acc: Set<string>, id: string) => {
            acc.add(id);

            return acc;
          }, new Set());

          entity[field] = [];

          relatedEntities.forEach((relatedEntity: any) => {
            if (relatedEntityIds.has(relatedEntity.id) && entity[field].length < DEFAULT_LIMIT) {
              entity[field].push(relatedEntity);
            }
          });
        });

        continue;
      }

      // field is neither an array nor derivedFrom

      // Avoid loading relation if selections only has id field.
      if (childSelections.length === 1 && childSelections[0].kind === 'Field' && childSelections[0].name.value === 'id') {
        entities.forEach((entity: any) => {
          entity[field] = { id: entity[field] };
        });

        continue;
      }

      const where: Where = {
        id: [{
          value: entities.map((entity: any) => entity[field]),
          not: false,
          operator: 'in'
        }]
      };

      const relatedEntities = await this.getEntities(
        queryRunner,
        relationEntity,
        relationsMap,
        where,
        {},
        childSelections
      );

      const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any}, entity: any) => {
        acc[entity.id] = entity;

        return acc;
      }, {});

      entities.forEach((entity: any) => {
        if (relatedEntitiesMap[entity[field]]) {
          entity[field] = relatedEntitiesMap[entity[field]];
        }
      });
    }

    return entities;
  }

  buildQuery<Entity> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    where: Where = {},
    alias: string
  ): SelectQueryBuilder<Entity> {
    Object.entries(where).forEach(([field, filters]) => {
      filters.forEach((filter, index) => {
        // Form the where clause.
        let { not, operator, value } = filter;
        const columnMetadata = repo.metadata.findColumnWithPropertyName(field);
        assert(columnMetadata);
        let whereClause = `"${alias}"."${columnMetadata.databaseName}" `;

        if (columnMetadata.relationMetadata) {
          // For relation fields, use the id column.
          const idColumn = columnMetadata.relationMetadata.joinColumns.find(column => column.referencedColumn?.propertyName === 'id');
          assert(idColumn);
          whereClause = `"${alias}"."${idColumn.databaseName}" `;
        }

        if (not) {
          if (operator === 'equals') {
            whereClause += '!';
          } else {
            whereClause += 'NOT ';
          }
        }

        whereClause += `${OPERATOR_MAP[operator]} `;

        if (operator === 'in') {
          whereClause += '(:...';
        } else {
          // Convert to string type value as bigint type throws error in query.
          value = value.toString();

          whereClause += ':';
        }

        const variableName = `${field}${index}`;
        whereClause += variableName;

        if (operator === 'in') {
          whereClause += ')';

          if (!value.length) {
            whereClause = 'FALSE';
          }
        }

        if (['contains', 'starts'].some(el => el === operator)) {
          value = `%${value}`;
        }

        if (['contains', 'ends'].some(el => el === operator)) {
          value += '%';
        }

        selectQueryBuilder = selectQueryBuilder.andWhere(whereClause, { [variableName]: value });
      });
    });

    return selectQueryBuilder;
  }

  orderQuery<Entity> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    orderOptions: { orderBy?: string, orderDirection?: string },
    alias: string,
    columnPrefix = ''
  ): SelectQueryBuilder<Entity> {
    const { orderBy, orderDirection } = orderOptions;
    assert(orderBy);

    const columnMetadata = repo.metadata.findColumnWithPropertyName(orderBy);
    assert(columnMetadata);

    return selectQueryBuilder.addOrderBy(
      `"${alias}"."${columnPrefix}${columnMetadata.databaseName}"`,
      orderDirection === 'desc' ? 'DESC' : 'ASC'
    );
  }
}
