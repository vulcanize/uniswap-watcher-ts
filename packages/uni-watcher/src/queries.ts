import { gql } from 'graphql-request';

export const queryEvents = gql`
query getEvents($blockHash: String!, $token: String!) {
  events(blockHash: $blockHash, token: $token) {
    event {
      __typename
    }
    proof {
      data
    }
  }
}
`;

export const queryPosition = gql`
query getPosition($blockHash: String!, $tokenId: BigInt!) {
  position(blockHash: $blockHash, token: $token) {
    nonce
    operator
    poolId
    tickLower
    tickUpper
    liquidity
    feeGrowthInside0LastX128
    feeGrowthInside1LastX128
    tokensOwed0
    tokensOwed1

    proof {
      data
    }
  }
}
`;

export const queryPoolIdToPoolKey = gql`
query poolIdToPoolKey($blockHash: String!, $poolId: BigInt!) {
  poolIdToPoolKey(blockHash: $blockHash, poolId: $poolId) {
    token0
    token1
    fee
    
    proof {
      data
    }
  }
}
`;

export const queryGetPool = gql`
query getPool($blockHash: String!, $token0: String!, $token1: String!, fee: BigInt!) {
  getPool(blockHash: $blockHash, token0: $token0, token1: $token1, fee: $fee) {
    pool
    proof {
      data
    }
  }
}
`;
