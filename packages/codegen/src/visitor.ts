//
// Copyright 2021 Vulcanize, Inc.
//

import { Schema } from './schema';

export class Visitor {
  _schema: Schema;

  constructor () {
    this._schema = new Schema();
  }

  functionDefinitionVisitor (node: any): void {
    if (node.stateMutability === 'view' && (node.visibility === 'external' || node.visibility === 'public')) {
      const name = node.name;
      const params = node.parameters.map((item: any) => {
        return { name: item.name, type: item.typeName.name };
      });

      // TODO Handle multiple return parameters and array return type.
      const returnType = node.returnParameters[0].typeName.name;

      this._schema.addQuery(name, params, returnType);
    }
  }

  eventDefinitionVisitor (node: any): void {
    const name = node.name;
    const params = node.parameters.map((item: any) => {
      return { name: item.name, type: item.typeName.name };
    });

    this._schema.addEventType(name, params);
  }

  exportSchema (outputFile?: string): void {
    this._schema.exportSchema(outputFile);
  }
}
