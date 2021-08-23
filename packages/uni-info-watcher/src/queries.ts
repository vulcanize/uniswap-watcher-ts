//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

export const queryToken = gql`
query queryToken($id: ID!, $block: Block_height) {
  token(id: $id, block: $block) {
    derivedETH
    feesUSD
    id
    name
    symbol
    totalValueLocked
    totalValueLockedUSD
    txCount
    volume
    volumeUSD
  }
}`;

export const queryFactories = gql`
query queryFactories($block: Block_height, $first: Int) {
  factories(first: $first, block: $block) {
    id
    totalFeesUSD
    totalValueLockedUSD
    totalVolumeUSD
    txCount
  }
}`;

export const queryBundles = gql`
query queryBundles($block: Block_height, $first: Int) {
  bundles(first: $first, block: $block) {
    id
    ethPriceUSD
  }
}`;

// Getting Pool by id.
export const queryPoolById = gql`
query queryPoolById($id: ID!) {
  pool(id: $id) {
    feeTier
    id
    liquidity
    sqrtPrice
    tick
    token0
    token0Price
    token1
    token1Price
    totalValueLockedToken0
    totalValueLockedToken1
    totalValueLockedUSD
    txCount
    volumeUSD
  }
}`;

export const queryTicks = gql`
query queryTicksByPool($skip: Int, $first: Int, $where: Tick_filter, $block: Block_height) {
  ticks(skip: $skip, first: $first, where: $where, block: $block) {
    id
    liquidityGross
    liquidityNet
    price0
    price1
    tickIdx
  }
}`;

// Getting Pool(s) filtered by tokens.
export const queryPoolsByTokens = gql`
query queryPoolsByTokens($tokens: [String!]) {
  pools(where: { token0_in: $tokens, token1_in: $tokens }) {
    id,
    feeTier
  }
}`;

// Getting UniswapDayData(s).
export const queryUniswapDayData = gql`
query queryUniswapDayData($first: Int, $orderBy: UniswapDayData_orderBy, $orderDirection: OrderDirection) {
  uniswapDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
    id,
    date,
    tvlUSD
  }
}`;

// Getting PoolDayData(s) filtered by pool and ordered by date.
export const queryPoolDayData = gql`
query queryPoolDayData($first: Int, $orderBy: PoolDayData_orderBy, $orderDirection: OrderDirection, $pool: String) {
  poolDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { pool: $pool }) {
    id,
    date,
    tvlUSD
  }
}`;

// Getting TokenDayDatas(s) filtered by token and ordered by date.
export const queryTokenDayData = gql`
query queryTokenDayData($first: Int, $orderBy: TokenDayData_orderBy, $orderDirection: OrderDirection, $token: String) {
  tokenDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { token: $token }) {
    id,
    date,
    totalValueLockedUSD
  }
}`;

// Getting TokenDayDatas(s) filtered by token and ordered by date.
export const queryTokenHourData = gql`
query queryTokenHourData($first: Int, $orderBy: TokenHourData_orderBy, $orderDirection: OrderDirection, $token: String) {
  tokenHourDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { token: $token }) {
    id,
    low,
    high,
    open,
    close,
    periodStartUnix
  }
}`;

// Getting mint(s) filtered by pool, tokens and ordered by timestamp.
export const queryMints = gql`
query queryMints(
  $first: Int,
  $orderBy: Mint_orderBy,
  $orderDirection: OrderDirection,
  $pool: String,
  $token0: String,
  $token1: String) {
    mints(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: {
        pool: $pool,
        token0: $token0,
        token1: $token1
      }) {
        amount0,
        amount1,
        amountUSD,
        id,
        origin,
        owner,
        sender,
        timestamp,
        pool {
          id
        },
        transaction {
          id
        }
      }
}`;

// Getting burns(s) filtered by pool, tokens and ordered by timestamp.
export const queryBurns = gql`
query queryBurns(
  $first: Int,
  $orderBy: Burn_orderBy,
  $orderDirection: OrderDirection,
  $pool: String,
  $token0: String,
  $token1: String) {
    burns(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: {
        pool: $pool,
        token0: $token0,
        token1: $token1
      }) {
        amount0,
        amount1,
        amountUSD,
        id,
        origin,
        owner,
        timestamp,
        pool {
          id
        },
        transaction {
          id
        }
      }
}`;

// Getting burns(s) filtered by pool, tokens and ordered by timestamp.
export const querySwaps = gql`
query querySwaps(
  $first: Int,
  $orderBy: Swap_orderBy,
  $orderDirection: OrderDirection,
  $pool: String,
  $token0: String,
  $token1: String) {
    swaps(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: {
        pool: $pool,
        token0: $token0,
        token1: $token1
      }) {
        amount0,
        amount1,
        amountUSD,
        id,
        origin,
        timestamp,
        pool {
          id
        },
        transaction {
          id
        }
      }
}`;

// Getting transactions(s) ordered by timestamp.
export const queryTransactions = gql`
query queryTransactions(
  $first: Int,
  $orderBy: Transaction_orderBy,
  $mintOrderBy: Mint_orderBy,
  $burnOrderBy: Burn_orderBy,
  $swapOrderBy: Swap_orderBy,
  $orderDirection: OrderDirection) {
    transactions(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection) {
        id,
        mints( first: $first, orderBy: $mintOrderBy, orderDirection: $orderDirection) {
          id,
          timestamp
        },
        burns( first: $first, orderBy: $burnOrderBy, orderDirection: $orderDirection) {
          id,
          timestamp
        },
        swaps( first: $first, orderBy: $swapOrderBy, orderDirection: $orderDirection) {
          id,
          timestamp
        },
        timestamp
      }
}`;

// Getting position filtered by id.
export const queryPositions = gql`
query queryPositions($first: Int, $id: ID) {
  positions(first: $first, where: { id: $id }) {
    id,
    pool {
      id
    },
    token0 {
      id
    },
    token1 {
      id
    },
    tickLower {
      id
    },
    tickUpper {
      id
    },
    transaction {
      id
    },
    liquidity,
    depositedToken0,
    depositedToken1,
    collectedFeesToken0,
    collectedFeesToken1,
    owner,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128
  }
}`;
