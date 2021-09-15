//
// Copyright 2021 Vulcanize, Inc.
//

import { GraphQLSchema, printSchema } from 'graphql';
import { SchemaComposer } from 'graphql-compose';
import { createWriteStream } from 'fs';
import { Writable } from 'stream';
import path from 'path';

export interface Param {
  name: string;
  type: string;
}

export class Schema {
  _composer: SchemaComposer;
  _outputTypeMapping: Map<string, string>;
  _typeMapping: Map<string, string>;
  _events: Array<string>;

  constructor () {
    this._composer = new SchemaComposer();
    this._outputTypeMapping = new Map();
    this._typeMapping = new Map();
    this._events = [];

    this._addBasicTypes();
  }

  addQuery (name: string, params: Array<Param>, returnType: string): void {
    // TODO: Handle cases where returnType/params type is an array.
    const queryObject: { [key: string]: any; } = {};
    queryObject[name] = {
      // Get type composer object for return type from the schema composer.
      type: this._composer.getOTC(this._outputTypeMapping.get(returnType)).NonNull,
      args: {
        blockHash: 'String!',
        contractAddress: 'String!'
      }
    };

    if (params.length > 0) {
      queryObject[name].args = params.reduce((acc, curr) => {
        acc[curr.name] = this._typeMapping.get(curr.type) + '!';
        return acc;
      }, queryObject[name].args);
    }

    // Add a query to the schema composer using queryObject.
    this._composer.Query.addFields(queryObject);
  }

  addEventType (name: string, params: Array<Param>): void {
    name = name + 'Event';

    const typeObject: any = {};
    typeObject.name = name;
    typeObject.fields = {};

    if (params.length > 0) {
      typeObject.fields = params.reduce((acc, curr) => {
        acc[curr.name] = this._typeMapping.get(curr.type) + '!';
        return acc;
      }, typeObject.fields);
    }

    // Create a type composer to add the required type in the schema composer.
    this._composer.createObjectTC(typeObject);

    this._events.push(name);

    if (this._events.length === 1) {
      this._addEventsRelatedTypes();
      this._addEventsQuery();
      this._addEventSubscription();
    } else {
      this._addToEventUnion(name);
    }
  }

  buildSchema (): GraphQLSchema {
    return this._composer.buildSchema();
  }

  exportSchema (outputFile?: string): void {
    const outStream: Writable = outputFile ? createWriteStream(path.resolve(outputFile)) : process.stdout;
    // Get schema as a string from GraphQLSchema.
    const schema = printSchema(this.buildSchema());
    outStream.write(schema);
  }

  _addBasicTypes (): void {
    // Create a scalar type composer to add the required scalar in the schema composer.
    this._composer.createScalarTC({
      name: 'BigInt'
    });

    // Create a type composer to add the required type in the schema composer.
    this._composer.createObjectTC({
      name: 'Proof',
      fields: {
        data: 'String!'
      }
    });

    this._composer.createObjectTC({
      name: 'ResultString',
      fields: {
        value: 'String!',
        proof: () => this._composer.getOTC('Proof')
      }
    });

    this._composer.createObjectTC({
      name: 'ResultUInt256',
      fields: {
        // Get type composer object for BigInt scalar from the schema composer.
        value: () => this._composer.getSTC('BigInt').NonNull,
        proof: () => this._composer.getOTC('Proof')
      }
    });

    this._outputTypeMapping.set('string', 'ResultString');
    this._outputTypeMapping.set('uint8', 'ResultUInt256');
    this._outputTypeMapping.set('uint256', 'ResultUInt256');

    // TODO Get typemapping from ethersjs.
    this._typeMapping.set('string', 'String');
    this._typeMapping.set('uint8', 'Int');
    this._typeMapping.set('uint256', 'BigInt');
    this._typeMapping.set('address', 'String');
  }

  _addEventsRelatedTypes (): void {
    // Create the Event union .
    const eventName = 'Event';
    const typeObject: any = {};
    typeObject.name = eventName;
    typeObject.types = Array.from(this._events, (event) => {
      return this._composer.getOTC(event);
    });

    // Create a union type composer to add the required union in the schema composer using typeObject.
    this._composer.createUnionTC(typeObject);

    // Create the ResultEvent type.
    const resultEventName = 'ResultEvent';
    this._composer.createObjectTC({
      name: resultEventName,
      fields: {
        // Get type composer object for Event union from the schema composer.
        event: () => this._composer.getUTC(eventName).NonNull,
        proof: () => this._composer.getOTC('Proof')
      }
    });

    // Create the WatchedEvent type.
    const watchedEventName = 'WatchedEvent';
    this._composer.createObjectTC({
      name: watchedEventName,
      fields: {
        blockHash: 'String!',
        token: 'String!',
        event: () => this._composer.getOTC(resultEventName).NonNull
      }
    });
  }

  _addEventsQuery (): void {
    this._composer.Query.addFields({
      events: {
        type: [this._composer.getOTC('ResultEvent').NonNull],
        args: {
          blockHash: 'String!',
          contractAddress: 'String!',
          name: 'String'
        }
      }
    });
  }

  _addEventSubscription (): void {
    // Add a subscription to the schema composer.
    this._composer.Subscription.addFields({
      onEvent: () => this._composer.getOTC('WatchedEvent').NonNull
    });
  }

  _addToEventUnion (event: string): void {
    // Get type composer object for Event union from the schema composer.
    const eventUnion = this._composer.getUTC('Event');
    // Add a new type to the union.
    eventUnion.addType(this._composer.getOTC(event));
  }
}
