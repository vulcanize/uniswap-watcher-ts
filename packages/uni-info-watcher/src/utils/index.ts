//
// Copyright 2021 Vulcanize, Inc.
//

import { BigNumber, utils } from 'ethers';
import { QueryRunner } from 'typeorm';
import assert from 'assert';

import { GraphDecimal } from '@cerc-io/util';

import { Transaction as TransactionEntity } from '../entity/Transaction';
import { Database } from '../database';
import { Transaction } from '../events';
import { Factory } from '../entity/Factory';
import { FACTORY_ADDRESS } from './constants';

export interface Block {
  headerId: number;
  number: number;
  hash: string;
  timestamp: number;
  parentHash: string;
  stateRoot: string;
  td: string;
  txRoot: string;
  receiptRoot: string;
  uncleHash: string;
  difficulty: string;
  gasLimit: string;
  gasUsed: string;
  author: string;
  size: string;
  baseFee?: string;
}

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

export const loadTransaction = async (db: Database, dbTx: QueryRunner, event: { block: Block, tx: Transaction }, skipStateFieldsUpdate: boolean): Promise<TransactionEntity> => {
  const { tx, block } = event;
  // Get the txHash in lowercase.
  const txHash = utils.hexlify(tx.hash);
  let transaction = await db.getTransaction(dbTx, { id: txHash, blockHash: block.hash });

  if (!transaction) {
    transaction = new TransactionEntity();
    transaction.id = txHash;
  }

  transaction._blockNumber = BigInt(block.number);
  transaction.timestamp = BigInt(block.timestamp);

  if (!skipStateFieldsUpdate) {
    transaction.gasUsed = BigInt(tx.gasLimit);

    let gasPrice = tx.gasPrice;

    if (!gasPrice) {
      // Compute gasPrice for EIP-1559 transaction
      // https://ethereum.stackexchange.com/questions/122090/what-does-tx-gasprice-represent-after-eip-1559
      const feeDifference = BigNumber.from(tx.maxFeePerGas).sub(BigNumber.from(block.baseFee));
      const maxPriorityFeePerGas = BigNumber.from(tx.maxPriorityFeePerGas);
      const priorityFeePerGas = maxPriorityFeePerGas.lt(feeDifference) ? maxPriorityFeePerGas : feeDifference;
      gasPrice = BigNumber.from(block.baseFee).add(priorityFeePerGas).toString();
    }

    transaction.gasPrice = BigInt(gasPrice);
  }

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

  return value.pow(power.toString());
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
