import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import { GraphQLClient } from 'graphql-request';

import { blocks } from './mock/data';
import { getStorageAt } from './eth-queries';
import { getMappingSlot } from './storage';

const ERC20_BALANCE_SLOT = "0x00";

export const createResolvers = (config) => {

  const { upstream } = config;
  assert(upstream, 'Missing upstream config');
  const { gqlEndpoint } = upstream;
  assert(upstream, 'Missing upstream gqlEndpoint');

  const client = new GraphQLClient(gqlEndpoint);

  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj) => {
        if (obj.owner) {
          return 'ApprovalEvent';
        }

        return 'TransferEvent';
      }
    },

    Query: {

      balanceOf: async (_, { blockHash, token, owner }) => {
        console.log('balanceOf', blockHash, token, owner);

        const slot = getMappingSlot(ERC20_BALANCE_SLOT, owner);

        const vars = {
          blockHash,
          contract: token,
          slot
        };

        const result = await client.request(getStorageAt, vars);
        console.log(JSON.stringify(result, null, 2));

        const { getStorageAt: { value, cid, ipldBlock }} = result;

        // TODO: Cache result.

        return {
          value,
          proof: {
            // TODO: Return proof only if requested.
            data: JSON.stringify({
              cid,
              ipldBlock
            })
          }
        }
      },

      allowance: (_, { blockHash, token, owner, spender }) => {
        console.log('allowance', blockHash, token, owner, spender);

        return {
          value: blocks[blockHash][token].allowance[owner][spender],
          proof: { data: '' }
        }
      },

      events: (_, { blockHash, token, name }) => {
        console.log('events', blockHash, token, name);
        return blocks[blockHash][token].events
          .filter(e => !name || name === e.name)
          .map(e => ({ 'event': e }));
      }
    }
  };
};
