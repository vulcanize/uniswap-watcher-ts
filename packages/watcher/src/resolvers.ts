import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import fs from 'fs-extra';
import path from 'path';
import "reflect-metadata";
import { createConnection } from "typeorm";

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import artifacts from './artifacts/ERC20.json';
import { Indexer } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (config) => {

  // TODO: Read db connection settings from toml file, move defaults out of config.
  const ormConfig = JSON.parse(await fs.readFile(path.join(process.cwd(), "ormconfig.json")));
  const db = await createConnection(ormConfig);

  const { upstream } = config;
  assert(upstream, 'Missing upstream config');

  const { gqlEndpoint, cache: cacheConfig } = upstream;
  assert(upstream, 'Missing upstream gqlEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({ gqlEndpoint, cache });

  const indexer = new Indexer(db, ethClient, artifacts);

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

      totalSupply: (_, { blockHash, token }) => {
        log('totalSupply', blockHash, token);
        return indexer.totalSupply(blockHash, token);
      },

      balanceOf: async (_, { blockHash, token, owner }) => {
        log('balanceOf', blockHash, token, owner);
        return indexer.balanceOf(blockHash, token, owner);
      },

      allowance: async (_, { blockHash, token, owner, spender }) => {
        log('allowance', blockHash, token, owner, spender);
        return indexer.allowance(blockHash, token, owner, spender);
      },

      name: (_, { blockHash, token }) => {
        log('name', blockHash, token);
        return indexer.name(blockHash, token);
      },

      symbol: (_, { blockHash, token }) => {
        log('symbol', blockHash, token);
        return indexer.symbol(blockHash, token);
      },

      decimals: (_, { blockHash, token }) => {
        log('decimals', blockHash, token);
        return indexer.decimals(blockHash, token);
      },

      events: async (_, { blockHash, token, name }) => {
        log('events', blockHash, token, name);
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
