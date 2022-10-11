//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';

export default gql`
scalar BigDecimal

scalar BigInt

scalar Bytes

# https://thegraph.com/docs/en/developer/create-subgraph-hosted/#non-fatal-errors
enum _SubgraphErrorPolicy_ {
  """Data will be returned even if the subgraph has indexing errors"""
  allow

  """
  If the subgraph has indexing errors, data will be omitted. The default.
  """
  deny
}

input Block_height {
  hash: Bytes
  number: Int
}

type Pool {
  feeTier: BigInt!
  id: ID!
  liquidity: BigInt!
  sqrtPrice: BigInt!
  tick: BigInt
  token0: Token!
  token0Price: BigDecimal!
  token1: Token!
  token1Price: BigDecimal!
  totalValueLockedToken0: BigDecimal!
  totalValueLockedToken1: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  txCount: BigInt!
  volumeUSD: BigDecimal!
  createdAtTimestamp: BigInt!
  createdAtBlockNumber: BigInt!
  feeGrowthGlobal0X128: BigInt!
  feeGrowthGlobal1X128: BigInt!
  observationIndex: BigInt!
  volumeToken0: BigDecimal!
  volumeToken1: BigDecimal!
  untrackedVolumeUSD: BigDecimal!
  feesUSD: BigDecimal!
  collectedFeesToken0: BigDecimal!
  collectedFeesToken1: BigDecimal!
  collectedFeesUSD: BigDecimal!
  totalValueLockedETH: BigDecimal!
  totalValueLockedUSDUntracked: BigDecimal!
  liquidityProviderCount: BigInt!
}

type PoolDayData {
  date: Int!
  id: ID!
  tvlUSD: BigDecimal!
  volumeUSD: BigDecimal!
  feesUSD: BigDecimal!
  pool: Pool!
  liquidity: BigInt!
  sqrtPrice: BigInt!
  token0Price: BigDecimal!
  token1Price: BigDecimal!
  tick: BigInt
  feeGrowthGlobal0X128: BigInt!
  feeGrowthGlobal1X128: BigInt!
  volumeToken0: BigDecimal!
  volumeToken1: BigDecimal!
  txCount: BigInt!
  open: BigDecimal!
  high: BigDecimal!
  low: BigDecimal!
  close: BigDecimal!
}

type Tick {
  id: ID!
  liquidityGross: BigInt!
  liquidityNet: BigInt!
  price0: BigDecimal!
  price1: BigDecimal!
  tickIdx: BigInt!
}

type Mint {
  amount0: BigDecimal!
  amount1: BigDecimal!
  amountUSD: BigDecimal
  id: ID!
  origin: Bytes!
  owner: Bytes!
  pool: Pool!
  sender: Bytes
  timestamp: BigInt!
  transaction: Transaction!
  token0: Token!
  token1: Token!
  amount: BigInt!
  tickLower: BigInt!
  tickUpper: BigInt!
}

type Swap {
  amount0: BigDecimal!
  amount1: BigDecimal!
  amountUSD: BigDecimal!
  id: ID!
  origin: Bytes!
  pool: Pool!
  timestamp: BigInt!
  transaction: Transaction!
  token0: Token!
  token1: Token!
  sender: Bytes!
  recipient: Bytes!
  sqrtPriceX96: BigInt!
  tick: BigInt!
}

type Burn {
  amount0: BigDecimal!
  amount1: BigDecimal!
  amountUSD: BigDecimal
  id: ID!
  origin: Bytes!
  owner: Bytes
  pool: Pool!
  timestamp: BigInt!
  transaction: Transaction!
}

type UniswapDayData {
  date: Int!
  id: ID!
  tvlUSD: BigDecimal!
  volumeUSD: BigDecimal!
  volumeETH: BigDecimal!
  volumeUSDUntracked: BigDecimal!
  feesUSD: BigDecimal!
  txCount: BigInt!
}

type Factory {
  id: ID!
  totalFeesUSD: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  totalVolumeUSD: BigDecimal!
  txCount: BigInt!
  poolCount: BigInt!
  totalVolumeETH: BigDecimal!
  totalFeesETH: BigDecimal!
  untrackedVolumeUSD: BigDecimal!
  totalValueLockedETH: BigDecimal!
  totalValueLockedUSDUntracked: BigDecimal!
  totalValueLockedETHUntracked: BigDecimal!
  owner: ID!
}

type Transaction {
  burns(skip: Int = 0, first: Int = 100, orderBy: Burn_orderBy, orderDirection: OrderDirection, where: Burn_filter): [Burn]!
  id: ID!
  mints(skip: Int = 0, first: Int = 100, orderBy: Mint_orderBy, orderDirection: OrderDirection, where: Mint_filter): [Mint]!
  swaps(skip: Int = 0, first: Int = 100, orderBy: Swap_orderBy, orderDirection: OrderDirection, where: Swap_filter): [Swap]!
  timestamp: BigInt!
}

type Token {
  decimals: BigInt!
  derivedETH: BigDecimal!
  feesUSD: BigDecimal!
  id: ID!
  name: String!
  symbol: String!
  totalValueLocked: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  txCount: BigInt!
  volume: BigDecimal!
  volumeUSD: BigDecimal!
  whitelistPools: [Pool]
  totalSupply: BigInt!
  untrackedVolumeUSD: BigDecimal!
}

type TokenDayData {
  date: Int!
  id: ID!
  totalValueLockedUSD: BigDecimal!
  volumeUSD: BigDecimal!
  token: Token!
  volume: BigDecimal!
  untrackedVolumeUSD: BigDecimal!
  totalValueLocked: BigDecimal!
  priceUSD: BigDecimal!
  feesUSD: BigDecimal!
  open: BigDecimal!
  high: BigDecimal!
  low: BigDecimal!
  close: BigDecimal!
}

type Bundle {
  ethPriceUSD: BigDecimal!
  id: ID!
}

type TokenHourData {
  close: BigDecimal!
  high: BigDecimal!
  id: ID!
  low: BigDecimal!
  open: BigDecimal!
  periodStartUnix: Int!
  token: Token!
  volume: BigDecimal!
  volumeUSD: BigDecimal!
  untrackedVolumeUSD: BigDecimal!
  totalValueLocked: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  priceUSD: BigDecimal!
  feesUSD: BigDecimal!
}

type Position {
  id: ID!
  pool: Pool!
  token0: Token!
  token1: Token!
  tickLower: Tick!
  tickUpper: Tick!
  transaction: Transaction!
  liquidity: BigInt!
  depositedToken0: BigDecimal!
  depositedToken1: BigDecimal!
  collectedFeesToken0: BigDecimal!
  collectedFeesToken1: BigDecimal!
  owner: Bytes!
  feeGrowthInside0LastX128: BigInt!
  feeGrowthInside1LastX128: BigInt!
  withdrawnToken0: BigDecimal!
  withdrawnToken1: BigDecimal!
}

type Block {
  number: Int!
  hash: Bytes!
  timestamp: Int!
}

type BlockProgressEvent {
  blockNumber: Int!
  blockHash: String!
  numEvents: Int!
  numProcessedEvents: Int!
  isComplete: Boolean!
}

enum OrderDirection {
  asc
  desc
}

input PoolDayData_filter {
  date_gt: Int
  pool: String
}

enum PoolDayData_orderBy {
  date
}

input Pool_filter {
  id: ID
  id_in: [ID!]
  token0: String
  token0_in: [String!]
  token1: String
  token1_in: [String!]
}

enum Pool_orderBy {
  totalValueLockedUSD
}

input Tick_filter {
  poolAddress: String
  tickIdx_gte: BigInt
  tickIdx_lte: BigInt
}

input Mint_filter {
  pool: String
  token0: String
  token1: String
  id: ID
}

enum Mint_orderBy {
  timestamp
}

input Swap_filter {
  pool: String
  token0: String
  token1: String
}

enum Swap_orderBy {
  timestamp
}

input Burn_filter {
  pool: String
  token0: String
  token1: String
}

enum Burn_orderBy {
  timestamp
}

enum UniswapDayData_orderBy {
  date
}

input UniswapDayData_filter {
  date_gt: Int
}

enum Transaction_orderBy {
  timestamp
}

input Transaction_filter {
  id: ID
}

input Token_filter {
  id: ID
  id_in: [ID!]
  name_contains: String
  symbol_contains: String
}

enum Token_orderBy {
  totalValueLockedUSD
}

input TokenDayData_filter {
  date_gt: Int
  token: String
}

enum TokenDayData_orderBy {
  date
}

input TokenHourData_filter {
  periodStartUnix_gt: Int
  token: String
}

enum TokenHourData_orderBy {
  periodStartUnix
}

input Position_filter {
  id: ID
}

input Block_filter {
  timestamp_gt: Int
  timestamp_lt: Int
}

enum Block_orderBy {
  timestamp
}

interface ChainIndexingStatus {
  chainHeadBlock: Block
  latestBlock: Block
}

type EthereumIndexingStatus implements ChainIndexingStatus {
  chainHeadBlock: Block
  latestBlock: Block
}

enum Health {
  """Syncing normally"""
  healthy

  """Syncing but with errors"""
  unhealthy

  """Halted due to errors"""
  failed
}

type SubgraphIndexingStatus {
  synced: Boolean!
  health: Health!
  chains: [ChainIndexingStatus!]!
}

type _Block_ {
  cid: String
  hash: String!
  number: Int!
  timestamp: Int!
  parentHash: String!
}

type ResultIPLDBlock {
  block: _Block_!
  contractAddress: String!
  cid: String
  kind: String!
  data: String!
}

type Query {
  bundle(
    id: ID!

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height

    """
    Set to 'allow' to receive data even if the subgraph has skipped over errors while syncing.
    """
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): Bundle

  bundles(
    first: Int = 100

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height

    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Bundle!]!

  burns(
    first: Int = 100
    orderBy: Burn_orderBy
    orderDirection: OrderDirection
    where: Burn_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Burn!]!

  factories(
    first: Int = 100

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height

    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Factory!]!

  mints(
    first: Int = 100
    orderBy: Mint_orderBy
    orderDirection: OrderDirection
    where: Mint_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Mint!]!

  pool(
    id: ID!
    block: Block_height
  ): Pool

  poolDayDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: PoolDayData_orderBy
    orderDirection: OrderDirection
    where: PoolDayData_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [PoolDayData!]!

  pools(
    first: Int = 100
    orderBy: Pool_orderBy
    orderDirection: OrderDirection
    where: Pool_filter

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height

    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Pool!]!

  swaps(
    first: Int = 100
    orderBy: Swap_orderBy
    orderDirection: OrderDirection
    where: Swap_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Swap!]!

  ticks(
    skip: Int = 0
    first: Int = 100
    where: Tick_filter

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height

    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Tick!]!

  token(
    id: ID!

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height

    subgraphError: _SubgraphErrorPolicy_! = deny
  ): Token

  tokenDayDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: TokenDayData_orderBy
    orderDirection: OrderDirection
    where: TokenDayData_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [TokenDayData!]!

  tokenHourDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: TokenHourData_orderBy
    orderDirection: OrderDirection
    where: TokenHourData_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [TokenHourData!]!

  tokens(
    first: Int = 100
    orderBy: Token_orderBy
    orderDirection: OrderDirection
    where: Token_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Token!]!

  transactions(
    first: Int = 100
    orderBy: Transaction_orderBy
    orderDirection: OrderDirection
    where: Transaction_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Transaction!]!

  uniswapDayDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: UniswapDayData_orderBy
    orderDirection: OrderDirection
    where: UniswapDayData_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [UniswapDayData!]!

  positions(
    first: Int = 100
    where: Position_filter
    block: Block_height
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Position!]!

  blocks(
    first: Int = 100
    orderBy: Block_orderBy
    orderDirection: OrderDirection
    where: Block_filter
    subgraphError: _SubgraphErrorPolicy_! = deny
  ): [Block!]!

  indexingStatusForCurrentVersion(
    subgraphName: String!
  ): SubgraphIndexingStatus

  getState(blockHash: String!, contractAddress: String!, kind: String): ResultIPLDBlock
}

#
# Subscriptions
#
type Subscription {
  # Watch for block progress events from filler process.
  onBlockProgressEvent: BlockProgressEvent!
}
`;
