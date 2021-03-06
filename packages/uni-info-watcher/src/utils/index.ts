//
// Copyright 2021 Vulcanize, Inc.
//

import { BigNumber, utils } from 'ethers';
import { QueryRunner } from 'typeorm';
import assert from 'assert';

import { GraphDecimal } from '@vulcanize/util';

import { Transaction as TransactionEntity } from '../entity/Transaction';
import { Database } from '../database';
import { Block, Transaction } from '../events';
import { Factory } from '../entity/Factory';
import { FACTORY_ADDRESS } from './constants';

export const exponentToBigDecimal = (decimals: bigint): GraphDecimal => {
  let bd = new GraphDecimal(1);

  for (let i = BigInt(0); i < BigInt(decimals); i++) {
    bd = bd.times(10);
  }

  return bd;
};

export const convertTokenToDecimal = (tokenAmount: bigint, exchangeDecimals: bigint): GraphDecimal => {
  if (exchangeDecimals === BigInt(0)) {
    return new GraphDecimal(tokenAmount.toString());
  }

  return (new GraphDecimal(tokenAmount.toString())).div(exponentToBigDecimal(exchangeDecimals));
};

export const loadTransaction = async (db: Database, dbTx: QueryRunner, event: { block: Block, tx: Transaction }): Promise<TransactionEntity> => {
  const { tx, block } = event;
  // Get the txHash in lowercase.
  const txHash = utils.hexlify(tx.hash);
  let transaction = await db.getTransaction(dbTx, { id: txHash, blockHash: block.hash });

  if (!transaction) {
    transaction = new TransactionEntity();
    transaction.id = txHash;
  }

  transaction.blockNumber = block.number;
  transaction.timestamp = BigInt(block.timestamp);

  return db.saveTransaction(dbTx, transaction, block);
};

// Return 0 if denominator is 0 in division.
export const safeDiv = (amount0: GraphDecimal, amount1: GraphDecimal): GraphDecimal => {
  if (amount1.isZero()) {
    return new GraphDecimal(0);
  } else {
    return amount0.div(amount1);
  }
};

export const bigDecimalExponated = (value: GraphDecimal, power: bigint): GraphDecimal => {
  if (power === BigInt(0)) {
    return new GraphDecimal(1);
  }

  const negativePower = power < BigInt(0);
  let result = (new GraphDecimal(0)).plus(value);
  const powerAbs = BigNumber.from(power).abs();

  for (let i = BigNumber.from(1); i.lt(powerAbs); i = i.add(1)) {
    result = result.times(value);
  }

  if (negativePower) {
    result = safeDiv(new GraphDecimal(1), result);
  }

  return result;
};

export const loadFactory = async (db: Database, dbTx: QueryRunner, block: Block, isDemo: boolean): Promise<Factory> => {
  let factory = await db.getFactory(dbTx, { blockHash: block.hash, id: FACTORY_ADDRESS });

  if (isDemo) {
    // Currently fetching first factory in database as only one exists.
    [factory] = await db.getModelEntities(dbTx, Factory, { hash: block.hash }, {}, { limit: 1 });
  }

  assert(factory);

  return factory;
};
