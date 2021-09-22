//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

import { getTsForSol, getPgForTs } from './utils/typemappings';
import { Param } from './utils/types';

const TEMPLATE_FILE = './templates/entityTemplate.handlebars';

export class Entity {
  _entities: Array<any>;
  _templateString: string;

  constructor () {
    this._entities = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  addQuery (name: string, params: Array<Param>, returnType: string): void {
    if (this._entities.filter(entity => entity.name === name).length !== 0) {
      return;
    }

    const entityObject: any = {
      // Capitalize the first letter of name.
      className: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      indexOn: {},
      columns: [{}],
      returnType: returnType
    };

    entityObject.indexOn.columns = params.map((param) => {
      return param.name;
    });
    entityObject.indexOn.unique = true;

    entityObject.columns = params.map((param) => {
      const length = param.type === 'address' ? 42 : null;
      const name = param.name;

      const tsType = getTsForSol(param.type);
      assert(tsType);

      const pgType = getPgForTs(tsType);
      assert(pgType);

      return {
        name,
        pgType,
        tsType,
        length
      };
    });

    const tsReturnType = getTsForSol(returnType);
    assert(tsReturnType);

    const pgReturnType = getPgForTs(tsReturnType);
    assert(pgReturnType);

    entityObject.columns.push({
      name: 'value',
      pgType: pgReturnType,
      tsType: tsReturnType
    });

    this._entities.push(entityObject);
  }

  exportEntities (entityDir: string): void {
    const template = Handlebars.compile(this._templateString);
    this._entities.forEach(entityObj => {
      const entity = template(entityObj);
      const outStream: Writable = entityDir
        ? fs.createWriteStream(path.join(entityDir, `${entityObj.className}.ts`))
        : process.stdout;
      outStream.write(entity);
    });
  }
}
