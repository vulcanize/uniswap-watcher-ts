import 'mocha';
import { expect } from 'chai';

import { GraphQLClient } from 'graphql-request';

import {
  queryBundle
} from '../queries';

const testCases: {
  balanceOf: any[],
  allowance: any[],
  events: any[],
  tokens: any[]
} = {
  balanceOf: [],
  allowance: [],
  events: [],
  tokens: []
};

describe('server', () => {
  const client = new GraphQLClient('http://localhost:3003/graphql');

  it('query token info', async () => {
    const tests = testCases.tokens;
    expect(tests.length).to.be.greaterThan(0);

    for (let i = 0; i < tests.length; i++) {
      const testCase = tests[i];

      // Bundle.
      const result = await client.request(queryBundle, testCase);
      expect(result.id).to.equal(testCase.info.id);
    }
  });
});
