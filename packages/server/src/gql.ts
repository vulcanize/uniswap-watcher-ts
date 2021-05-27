import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';

import * as typeDefs from './erc20.graphql';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';

const resolvers = process.env.MOCK ? createMockResolvers() : createResolvers();

export const createSchema = () => {
  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};
