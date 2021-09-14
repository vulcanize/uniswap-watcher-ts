//
// Copyright 2021 Vulcanize, Inc.
//

import { GraphQLSchema, printSchema } from 'graphql';
import { SchemaComposer } from 'graphql-compose';
import { Writable } from 'stream';

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
    // TODO: This function gets called twice for a query because of function declaration in interface and definition in contract.
    // TODO: Handle cases where returnType/params type is an array.
    const queryObject: { [key: string]: any; } = {};
    queryObject[name] = {
      type: this._composer.getOTC(this._outputTypeMapping.get(returnType)).NonNull,
      args: {
        blockHash: 'String!',
        token: 'String!'
      }
    };
    if (params.length > 0) {
      queryObject[name].args = params.reduce((acc, curr) => {
        acc[curr.name] = this._typeMapping.get(curr.type) + '!';
        return acc;
      }, queryObject[name].args);
    }

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

  exportSchema (outStream: Writable): void {
    const schema = printSchema(this.buildSchema());
    outStream.write(schema);
  }

  _addBasicTypes (): void {
    this._composer.createScalarTC({
      name: 'BigInt'
    });

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
    // Create the Event union type.
    const eventName = 'Event';
    const typeObject: any = {};
    typeObject.name = eventName;
    typeObject.types = Array.from(this._events, (event) => {
      return this._composer.getOTC(event);
    });

    this._composer.createUnionTC(typeObject);

    // Create the ResultEvent type.
    const resultEventName = 'ResultEvent';
    this._composer.createObjectTC({
      name: resultEventName,
      fields: {
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
          token: 'String!',
          name: 'String'
        }
      }
    });
  }

  _addEventSubscription (): void {
    this._composer.Subscription.addFields({
      onEvent: () => this._composer.getOTC('WatchedEvent').NonNull
    });
  }

  _addToEventUnion (event: string): void {
    const eventUnion = this._composer.getUTC('Event');
    eventUnion.addType(this._composer.getOTC(event));
  }
}
