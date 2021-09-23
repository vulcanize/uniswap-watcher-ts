//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import Handlebars from 'handlebars';
import assert from 'assert';
import _ from 'lodash';

import { getTsForSol } from './utils/typemappings';
import { Param } from './utils/types';

const TEMPLATE_FILE = './templates/resolversTemplate.handlebars';

export class Resolvers {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  addQuery (name: string, params: Array<Param>, returnType: string): void {
    // Check if the query is already added.
    if (this._queries.some(query => query.name === name)) {
      return;
    }

    const queryObject = {
      name: name,
      params: _.cloneDeep(params),
      returnType: returnType
    };

    queryObject.params = queryObject.params.map((param) => {
      const tsParamType = getTsForSol(param.type);
      assert(tsParamType);
      param.type = tsParamType;
      return param;
    });

    this._queries.push(queryObject);
  }

  exportResolvers (outStream: Writable): void {
    const template = Handlebars.compile(this._templateString);
    const obj = {
      queries: this._queries
    };
    const resolvers = template(obj);
    outStream.write(resolvers);
  }
}
