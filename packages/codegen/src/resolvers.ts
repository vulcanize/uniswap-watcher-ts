//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import { Writable } from 'stream';
import Handlebars from 'handlebars';
import { GraphQLSchema } from 'graphql';

export interface Param {
  name: string;
  type: string;
}

export class Resolvers {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync('src/templates/resolversTemplate.handlebars').toString();
  }

  processSchema (schema: GraphQLSchema): void {
    // Use methods like this._addQuery() to build up the object.
  }

  exportResolvers (outStream: Writable): void {
    const template = Handlebars.compile(this._templateString);
    const obj = this._prepareObject();
    const resolvers = template(obj);
    outStream.write(resolvers);
  }

  _prepareObject (): any {
    return {
      queries: this._queries
    };
  }

  _addQuery (name: string, params: Array<Param>, returnType: string): void {
    this._queries.push({
      name,
      params,
      returnType
    });
  }
}
