//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Handlebars from 'handlebars';
import { Writable } from 'stream';
import _ from 'lodash';

import { getTsForSol } from './utils/typemappings';
import { Param } from './utils/types';
import { compareHelper } from './utils/compareHelper';

const TEMPLATE_FILE = './templates/indexerTemplate.handlebars';

export class Indexer {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();

    Handlebars.registerHelper('compare', compareHelper);
  }

  addQuery (name: string, params: Array<Param>, returnType: string): void {
    if (this._queries.filter(query => query.name === name).length !== 0) {
      return;
    }

    const queryObject = {
      name: _.cloneDeep(name),
      params: _.cloneDeep(params),
      returnType: _.cloneDeep(returnType)
    };

    queryObject.params = queryObject.params.map((param) => {
      const tsParamType = getTsForSol(param.type);
      assert(tsParamType);
      param.type = tsParamType;
      return param;
    });

    const tsReturnType = getTsForSol(returnType);
    assert(tsReturnType);
    queryObject.returnType = tsReturnType;

    this._queries.push(queryObject);
  }

  exportIndexer (outStream: Writable): void {
    const template = Handlebars.compile(this._templateString);
    const obj = {
      queries: this._queries
    };
    const indexer = template(obj);
    outStream.write(indexer);
  }
}
