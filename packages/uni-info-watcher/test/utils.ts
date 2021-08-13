//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import { ethers } from 'ethers';
import { request } from 'graphql-request';
import Decimal from 'decimal.js';

import {
  queryFactory,
  queryBundle,
  queryToken,
  queryPoolById,
  queryPoolDayData,
  queryUniswapDayData,
  queryTokenDayData,
  queryTokenHourData,
  queryTransactions
} from '../test/queries';
import { TestDatabase } from './test-db';
import { Block } from '../src/events';
import { Token } from '../src/entity/Token';

export const checkUniswapDayData = async (endpoint: string): Promise<void> => {
  // Checked values: date, tvlUSD.
  // Unchecked values: volumeUSD.

  // Get the latest UniswapDayData.
  const variables = {
    first: 1,
    orderBy: 'date',
    orderDirection: 'desc'
  };
  const data = await request(endpoint, queryUniswapDayData, variables);
  expect(data.uniswapDayDatas).to.not.be.empty;

  const id: string = data.uniswapDayDatas[0].id;
  const dayID = Number(id);
  const date = data.uniswapDayDatas[0].date;
  const tvlUSD = data.uniswapDayDatas[0].tvlUSD;

  const dayStartTimestamp = dayID * 86400;
  const factoryData = await request(endpoint, queryFactory);
  const totalValueLockedUSD: string = factoryData.factories[0].totalValueLockedUSD;

  expect(date).to.be.equal(dayStartTimestamp);
  expect(tvlUSD).to.be.equal(totalValueLockedUSD);
};

export const checkPoolDayData = async (endpoint: string, poolAddress: string): Promise<void> => {
  // Checked values: id, date, tvlUSD.
  // Unchecked values: volumeUSD.

  // Get the latest PoolDayData.
  const variables = {
    first: 1,
    orderBy: 'date',
    orderDirection: 'desc',
    pool: poolAddress
  };
  const data = await request(endpoint, queryPoolDayData, variables);
  expect(data.poolDayDatas).to.not.be.empty;

  const dayPoolID: string = data.poolDayDatas[0].id;
  const poolID: string = dayPoolID.split('-')[0];
  const dayID = Number(dayPoolID.split('-')[1]);
  const date = data.poolDayDatas[0].date;
  const tvlUSD = data.poolDayDatas[0].tvlUSD;

  const dayStartTimestamp = dayID * 86400;
  const poolData = await request(endpoint, queryPoolById, { id: poolAddress });
  const totalValueLockedUSD: string = poolData.pool.totalValueLockedUSD;

  expect(poolID).to.be.equal(poolAddress);
  expect(date).to.be.equal(dayStartTimestamp);
  expect(tvlUSD).to.be.equal(totalValueLockedUSD);
};

export const checkTokenDayData = async (endpoint: string, tokenAddress: string): Promise<void> => {
  // Checked values: id, date, totalValueLockedUSD.
  // Unchecked values: volumeUSD.

  // Get the latest TokenDayData.
  const variables = {
    first: 1,
    orderBy: 'date',
    orderDirection: 'desc',
    token: tokenAddress
  };
  const data = await request(endpoint, queryTokenDayData, variables);
  expect(data.tokenDayDatas).to.not.be.empty;

  const tokenDayID: string = data.tokenDayDatas[0].id;
  const tokenID: string = tokenDayID.split('-')[0];
  const dayID = Number(tokenDayID.split('-')[1]);
  const date = data.tokenDayDatas[0].date;
  const tvlUSD = data.tokenDayDatas[0].totalValueLockedUSD;

  const dayStartTimestamp = dayID * 86400;
  const tokenData = await request(endpoint, queryToken, { id: tokenAddress });
  const totalValueLockedUSD: string = tokenData.token.totalValueLockedUSD;

  expect(tokenID).to.be.equal(tokenAddress);
  expect(date).to.be.equal(dayStartTimestamp);
  expect(tvlUSD).to.be.equal(totalValueLockedUSD);
};

export const checkTokenHourData = async (endpoint: string, tokenAddress: string): Promise<void> => {
  // Checked values: id, periodStartUnix, low, high, open, close.
  // Unchecked values:

  // Get the latest TokenHourData.
  const variables = {
    first: 1,
    orderBy: 'periodStartUnix',
    orderDirection: 'desc',
    token: tokenAddress
  };
  const data = await request(endpoint, queryTokenHourData, variables);
  expect(data.tokenHourDatas).to.not.be.empty;

  const tokenHourID: string = data.tokenHourDatas[0].id;
  const tokenID: string = tokenHourID.split('-')[0];
  const hourIndex = Number(tokenHourID.split('-')[1]);
  const periodStartUnix = data.tokenHourDatas[0].periodStartUnix;
  const low = data.tokenHourDatas[0].low;
  const high = data.tokenHourDatas[0].high;
  const open = data.tokenHourDatas[0].open;
  const close = data.tokenHourDatas[0].close;

  const hourStartUnix = hourIndex * 3600;
  const tokenData = await request(endpoint, queryToken, { id: tokenAddress });
  const bundleData = await request(endpoint, queryBundle);
  const tokenPrice = new Decimal(tokenData.token.derivedETH).times(bundleData.bundles[0].ethPriceUSD);

  expect(tokenID).to.be.equal(tokenAddress);
  expect(periodStartUnix).to.be.equal(hourStartUnix);
  expect(low).to.be.equal(tokenPrice.toString());
  expect(high).to.be.equal(tokenPrice.toString());
  expect(open).to.be.equal(tokenPrice.toString());
  expect(close).to.be.equal(tokenPrice.toString());
};

export const fetchTransaction = async (endpoint: string): Promise<{transaction: any}> => {
  // Get the latest Transaction.
  // Get only the latest mint, burn and swap entity in the transaction.

  const variables = {
    first: 1,
    orderBy: 'timestamp',
    mintOrderBy: 'timestamp',
    burnOrderBy: 'timestamp',
    swapOrderBy: 'timestamp',
    orderDirection: 'desc'
  };

  const data = await request(endpoint, queryTransactions, variables);
  expect(data.transactions).to.not.be.empty;
  const transaction = data.transactions[0];

  expect(transaction.mints).to.be.an.instanceOf(Array);
  expect(transaction.burns).to.be.an.instanceOf(Array);
  expect(transaction.swaps).to.be.an.instanceOf(Array);

  return transaction;
};

export const insertDummyBlockProgress = async (db: TestDatabase, parentBlock?: Block): Promise<Block> => {
  // Save a dummy BlockProgress entity after parentBlock.

  const dbTx = await db.createTransactionRunner();

  try {
    if (!parentBlock) {
      const randomByte = ethers.utils.randomBytes(10);
      const hash = ethers.utils.sha256(randomByte);
      parentBlock = {
        number: 0,
        hash,
        timestamp: -1,
        parentHash: ''
      };
    }

    const randomByte = ethers.utils.randomBytes(10);
    const blockHash = ethers.utils.sha256(randomByte);
    const blockTimestamp = Math.floor(Date.now() / 1000);
    const parentHash = parentBlock.hash;
    const blockNumber = parentBlock.number + 1;

    const block: Block = {
      number: blockNumber,
      hash: blockHash,
      timestamp: blockTimestamp,
      parentHash
    };
    await db.updateSyncStatus(dbTx, blockHash, blockNumber);
    await db.saveEvents(dbTx, block, []);

    await dbTx.commitTransaction();
    return block;
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
};

export const insertDummyToken = async (db: TestDatabase, block: Block, token?: Token): Promise<Token> => {
  // Save a dummy Token entity at block.

  if (!token) {
    const randomByte = ethers.utils.randomBytes(20);
    const tokenAddress = ethers.utils.hexValue(randomByte);

    token = new Token();
    token.symbol = 'TEST';
    token.name = 'TestToken';
    token.id = tokenAddress;
    token.totalSupply = new Decimal(0);
    token.decimals = BigInt(0);
  }

  const dbTx = await db.createTransactionRunner();

  try {
    token = await db.saveToken(dbTx, token, block);
    dbTx.commitTransaction();
    return token;
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
};

export async function removeEntities<Entity> (db: TestDatabase, entity: new () => Entity): Promise<void> {
  // Remove all entries of the specified entity from database.

  const dbTx = await db.createTransactionRunner();

  try {
    await db.removeEntities(dbTx, entity);
    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
}
