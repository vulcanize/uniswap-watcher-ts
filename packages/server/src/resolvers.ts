import BigInt from 'apollo-type-bigint';
import { ethers } from 'ethers';

import { EthLoader } from './eth-loader';
import { getMappingSlot } from './storage';

// Event slots.
// TODO: Read from storage layout file.
const ERC20_BALANCE_OF_SLOT = "0x00";
const ERC20_ALLOWANCE_SLOT = "0x01";

// Event signatures.
// TODO: Generate from ABI.
const ERC20_EVENT_NAME_TOPICS = {
  "Transfer": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  "Approval": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
};

// Topic to GQL event name.
// TODO: Generate from ABI.
const GQL_EVENT_TYPE = {
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "TransferEvent",
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "ApprovalEvent"
};

const toAddress = (topic) => {
  return ethers.utils.getAddress(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(topic), 20
    )
  );
};

export const createResolvers = (config) => {

  const ethLoader = new EthLoader(config);

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

        const slot = getMappingSlot(ERC20_BALANCE_OF_SLOT, owner);

        const vars = {
          blockHash,
          contract: token,
          slot
        };

        const result = await ethLoader.get('getStorageAt', vars);
        console.log(JSON.stringify(result, null, 2));

        const { getStorageAt: { value, cid, ipldBlock }} = result;

        return {
          value,
          proof: {
            // TODO: Return proof only if requested.
            data: JSON.stringify({
              blockHash,
              storage: {
                cid,
                ipldBlock
              }
            })
          }
        }
      },

      allowance: async (_, { blockHash, token, owner, spender }) => {
        console.log('allowance', blockHash, token, owner, spender);

        const slot = getMappingSlot(getMappingSlot(ERC20_ALLOWANCE_SLOT, owner), spender);

        const vars = {
          blockHash,
          contract: token,
          slot
        };

        const result = await ethLoader.get('getStorageAt', vars);
        console.log(JSON.stringify(result, null, 2));

        const { getStorageAt: { value, cid, ipldBlock }} = result;

        return {
          value,
          proof: {
            // TODO: Return proof only if requested.
            data: JSON.stringify({
              blockHash,
              storage: {
                cid,
                ipldBlock
              }
            })
          }
        }
      },

      events: async (_, { blockHash, token, name }) => {
        console.log('events', blockHash, token, name);

        const vars = {
          blockHash,
          contract: token
        };

        const result = await ethLoader.get('getLogs', vars);
        console.log(JSON.stringify(result, null, 2));

        return result.getLogs
          .filter(e => !name || ERC20_EVENT_NAME_TOPICS[name] === e.topics[0])
          .map(e => {
            let [topic0, topic1, topic2] = e.topics;

            const eventName = GQL_EVENT_TYPE[topic0];
            topic1 = toAddress(topic1);
            topic2 = toAddress(topic2);

            const eventFields = { value : e.data };


            switch (eventName) {
              case 'TransferEvent': {
                eventFields['from'] = topic1;
                eventFields['to'] = topic2;
                break;
              };
              case 'ApprovalEvent': {
                eventFields['owner'] = topic1;
                eventFields['spender'] = topic2;
                break;
              };
            }

            return {
              event: {
                __typename: eventName,
                ...eventFields
              },
              proof: {
                // TODO: Return proof only if requested.
                data: JSON.stringify({
                  blockHash,
                  receipt: {
                    cid: e.cid,
                    ipldBlock: e.ipldBlock
                  }
                })
              }
            }
          });
      }
    }
  };
};
