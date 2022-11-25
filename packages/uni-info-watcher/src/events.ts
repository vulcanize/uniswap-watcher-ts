//
// Copyright 2021 Vulcanize, Inc.
//

export interface PoolCreatedEvent {
  __typename: 'PoolCreatedEvent';
  token0: string;
  token1: string;
  fee: string;
  tickSpacing: string;
  pool: string;
}

export interface InitializeEvent {
  __typename: 'InitializeEvent';
  sqrtPriceX96: string;
  tick: string;
}

export interface MintEvent {
  __typename: 'MintEvent';
  sender: string;
  owner: string;
  tickLower: string;
  tickUpper: string;
  amount: string;
  amount0: string;
  amount1: string;
}

export interface BurnEvent {
  __typename: 'BurnEvent';
  owner: string;
  tickLower: string;
  tickUpper: string;
  amount: string;
  amount0: string;
  amount1: string;
}

export interface SwapEvent {
  __typename: 'SwapEvent';
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: string;
}

export interface FlashEvent {
  __typename: 'FlashEvent';
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  paid0: string;
  paid1: string;
}

export interface IncreaseLiquidityEvent {
  __typename: 'IncreaseLiquidityEvent';
  tokenId: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface DecreaseLiquidityEvent {
  __typename: 'DecreaseLiquidityEvent';
  tokenId: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface CollectEvent {
  __typename: 'CollectEvent';
  tokenId: string;
  recipient: string;
  amount0: string;
  amount1: string;
}

export interface TransferEvent {
  __typename: 'TransferEvent';
  from: string;
  to: string;
  tokenId: string;
}

export interface Block {
  number: number;
  hash: string;
  timestamp: number;
  parentHash: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  index: number;
  value: string;
  gasLimit: string;
  gasPrice?: string;
  input: string;
  maxPriorityFeePerGas?: string,
  maxFeePerGas?: string,
}

export interface ResultEvent {
  block: Block;
  tx: Transaction;
  contract: string;
  eventIndex: number;
  event: PoolCreatedEvent | InitializeEvent | MintEvent | BurnEvent | SwapEvent | FlashEvent | IncreaseLiquidityEvent | DecreaseLiquidityEvent | CollectEvent | TransferEvent;
  proof: {
    data: string;
  }
}
