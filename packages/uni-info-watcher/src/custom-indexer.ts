//
// Copyright 2022 Vulcanize, Inc.
//

import { SelectionNode } from 'graphql';

import { Config, QueryOptions } from '@cerc-io/util';

import { Indexer } from './indexer';
import { Database, DEFAULT_LIMIT } from './database';
import { resolveEntityFieldConflicts } from './utils';

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
    latestEntity: new () => any,
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

      const repo = dbTx.manager.getRepository(entity);
      const { tableName } = repo.metadata;

      let selectQueryBuilder = repo.createQueryBuilder(tableName)
        .innerJoin(
          latestEntity,
          'latest',
          `latest.id = ${tableName}.id AND latest.latestBlockHash = ${tableName}.blockHash`
        );

      selectQueryBuilder = this._db.baseDatabase.buildQuery(repo, selectQueryBuilder, where);

      if (queryOptions.orderBy) {
        selectQueryBuilder = this._db.baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions);
      }

      selectQueryBuilder = this._db.baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' });

      if (queryOptions.skip) {
        selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
      }

      if (queryOptions.limit) {
        selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
      }

      let entities = await selectQueryBuilder.getMany();

      if (!entities.length) {
        return [];
      }

      entities = await this._db.graphDatabase.loadEntitiesRelations(dbTx, {}, this._db.relationsMap, entity, entities, selections);
      // Resolve any field name conflicts in the entity result.
      res = entities.map(entity => resolveEntityFieldConflicts(entity));

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }
}
