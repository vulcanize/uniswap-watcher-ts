//
// Copyright 2021 Vulcanize, Inc.
//

import { Schema } from './schema';

export class Visitor {
  schema: Schema;

  constructor () {
    this.schema = new Schema();
  }

  functionDefinitionVisitor = (node: any): void => {
    if (node.stateMutability === 'view' && (node.visibility === 'external' || node.visibility === 'public')) {
      const name = node.name;
      const params = node.parameters.map((item: any) => {
        return { name: item.name, type: item.typeName.name };
      });
      const returnType = node.returnParameters[0].typeName.name;

      this.schema.addQuery(name, params, returnType);
    }
  }

  eventDefinitionVisitor = (node: any): void => {
    const name = node.name;
    const params = node.parameters.map((item: any) => {
      return { name: item.name, type: item.typeName.name };
    });

    this.schema.addEventType(name, params);
  }
}
