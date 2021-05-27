import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';

import * as typeDefs from './erc20.graphql';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';

export const createSchema = (config) => {
  const resolvers = process.env.MOCK ? createMockResolvers(config) : createResolvers(config);

  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};
