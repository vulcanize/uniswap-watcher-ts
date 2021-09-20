//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

import { getTsForSol } from './utils/typemappings';
import { Param } from './utils/types';

const TEMPLATE_FILE = './templates/indexerTemplate.handlebars';

export class Indexer {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();

    // TODO Refactor this helper code in a common folder.
    // http://doginthehat.com.au/2012/02/comparison-block-helper-for-handlebars-templates/
    Handlebars.registerHelper('compare', (lvalue, rvalue, options) => {
      assert(lvalue && rvalue, "Handlerbars Helper 'compare' needs 2 parameters");

      const operator: string = options.hash.operator || '===';

      const operators: Map<string, (l:any, r:any) => boolean> = new Map();

      // eslint-disable-next-line eqeqeq
      operators.set('==', function (l: any, r: any) { return l == r; });
      operators.set('===', function (l: any, r: any) { return l === r; });
      operators.set('!=', function (l: any, r: any) { return l !== r; });
      operators.set('<', function (l: any, r: any) { return l < r; });
      operators.set('>', function (l: any, r: any) { return l > r; });
      operators.set('<=', function (l: any, r: any) { return l <= r; });
      operators.set('>=', function (l: any, r: any) { return l >= r; });

      const operatorFunction = operators.get(operator);
      assert(operatorFunction, "Handlerbars Helper 'compare' doesn't know the operator " + operator);
      const result = operatorFunction(lvalue, rvalue);

      if (result) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });
  }

  addQuery (name: string, params: Array<Param>, returnType: string): void {
    const queryObject = {
      name,
      params,
      returnType
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

    if (this._queries.filter(query => query.name === queryObject.name).length === 0) {
      this._queries.push(queryObject);
    }
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
