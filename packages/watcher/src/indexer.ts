import assert from "assert";
import debug from 'debug';
import { invert } from "lodash";
import { EthClient, getMappingSlot, topictoAddress } from "@vulcanize/ipld-eth-client";
import { getStorageInfo, getEventNameTopics, getStorageValue } from '@vulcanize/solidity-mapper';

import { Database } from './database';
import { storageLayout, abi } from './artifacts/ERC20.json';

const log = debug('vulcanize:indexer');

export class Indexer {

  _db: Database
  _ethClient: EthClient

  constructor(connection, ethClient) {
    assert(connection);
    assert(ethClient);

    this._db = new Database(connection);
    this._ethClient = ethClient;
  }

  async totalSupply(blockHash, token) {
    const { slot } = getStorageInfo(storageLayout, '_totalSupply');

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._ethClient.getStorageAt(vars);
    log(JSON.stringify(result, null, 2));

    return result;
  }

  async getBalanceOf(blockHash, token, owner) {
    const entity = await this._db.getBalance({ blockHash, token, owner });
    if (entity) {
      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      }
    }

    const { slot: balancesSlot } = getStorageInfo(storageLayout, '_balances');
    const slot = getMappingSlot(balancesSlot, owner);

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._ethClient.getStorageAt(vars);
    log(JSON.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveBalance({ blockHash, token, owner, value, proof: JSON.stringify(proof) });

    return result;
  }

  async getAllowance(blockHash, token, owner, spender) {
    const entity = await this._db.getAllowance({ blockHash, token, owner, spender });
    if (entity) {
      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      }
    }

    const { slot: allowancesSlot } = getStorageInfo(storageLayout, '_allowances');
    const slot = getMappingSlot(getMappingSlot(allowancesSlot, owner), spender);

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._ethClient.getStorageAt(vars);
    log(JSON.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveAllowance({ blockHash, token, owner, spender, value, proof: JSON.stringify(proof) });

    return result;
  }

  async name(blockHash, token) {
    const result = await getStorageValue(
      storageLayout,
      this._ethClient.getStorageAt.bind(this._ethClient),
      blockHash,
      token,
      '_name'
    )

    log(JSON.stringify(result, null, 2));

    return result;
  }

  async symbol(blockHash, token) {
    const result = await getStorageValue(
      storageLayout,
      this._ethClient.getStorageAt.bind(this._ethClient),
      blockHash,
      token,
      '_symbol'
    )

    log(JSON.stringify(result, null, 2));

    return result;
  }

  async decimals(blockHash, token) {
    // Not a state variable, uses hardcoded return value in contract function.
    // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L86

    throw new Error('Not implemented.');
  }

  async getEvents(blockHash, token, name) {
    const didSyncEvents = await this._db.didSyncEvents({ blockHash, token });
    if (!didSyncEvents) {
      // Sync events first and make a note in the event sync progress table.
      await this._syncEvents({ blockHash, token })
    }

    const vars = {
      blockHash,
      contract: token
    };

    const logs = await this._ethClient.getLogs(vars);
    log(JSON.stringify(logs, null, 2));

    const erc20EventNameTopics = getEventNameTopics(abi);
    const gqlEventType = invert(erc20EventNameTopics);

    return logs
      .filter(e => !name || erc20EventNameTopics[name] === e.topics[0])
      .map(e => {
        const [topic0, topic1, topic2] = e.topics;

        const eventName = gqlEventType[topic0];
        const address1 = topictoAddress(topic1);
        const address2 = topictoAddress(topic2);

        const eventFields = { value: e.data };


        switch (eventName) {
          case 'Transfer': {
            eventFields['from'] = address1;
            eventFields['to'] = address2;
            break;
          };
          case 'Approval': {
            eventFields['owner'] = address1;
            eventFields['spender'] = address2;
            break;
          };
        }

        return {
          event: {
            __typename: `${eventName}Event`,
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

  async _syncEvents({ blockHash, token }) {
    const logs = await this._ethClient.getLogs({ blockHash, contract: token });
    log(JSON.stringify(logs, null, 2));

    const erc20EventNameTopics = getEventNameTopics(abi);

    const dbEvents = logs.map(log => {
      const { topics, data, cid, ipldBlock } = log;

    });

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the event progress table.
  }
}