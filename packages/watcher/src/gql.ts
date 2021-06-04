import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';

import * as typeDefs from './erc20.graphql';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { Config, createResolvers } from './resolvers';

export const createSchema = async (config: Config) => {
  const resolvers = process.env.MOCK ? await createMockResolvers() : await createResolvers(config);

  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};
