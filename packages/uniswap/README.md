# Uniswap

## View Methods in Uniswap V3 Core

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/NoDelegateCall.sol
  - checkNotDelegateCall (private)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/UniswapV3Pool.sol#L158
  - _blockTimestamp (internal)
  - balance0 (private)
  - balance1 (private)
  - snapshotCumulativesInside (external)
  - observe (external)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Oracle.sol
  - binarySearch (private)
  - getSurroundingObservations (private)
  - observeSingle (internal)
  - observe (internal)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Position.sol
  - get (internal)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Tick.sol
  - getFeeGrowthInside (internal)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/TickBitmap.sol
  - nextInitializedTickWithinOneWord (internal)

## Queries in uniswap subgraph frontend
Actual queries are listed in [queries](./queries.md) file.

* indexingStatusForCurrentVersion (Subgraph Health) - https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/application/index.ts
* PoolDayData
  - poolDayDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/chartData.ts)

* Pool
  - pools
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/poolData.ts
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/topPools.ts
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/search/index.ts
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/poolsForToken.ts
  - pool
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/tickData.ts

* Tick
  -  tick (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/tickData.ts)

* Mint
  - mints
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/transactions.ts
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts

* UniswapDayData
  - uniswapDayDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/chart.ts)

* Factory
  - factories (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/overview.ts)

* Transaction
  - transactions (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/transactions.ts)

* Token
  - tokens
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/search/index.ts
    * (queried by block) https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/tokenData.ts
    * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/topTokens.ts
  - token queried by block (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts)

* TokenDayData
  - tokenDayDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/chartData.ts)

* Bundle
  - bundle queried by block (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts)
  - bundles (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/hooks/useEthPrices.ts)

* TokenHourData
  - tokenHourDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts)

* Swap
  - swaps (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts)

* Burn
  - burns (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts)

* Query blocks from https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks
  - t${timestamp}:blocks (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/hooks/useBlocksFromTimestamps.ts)
## References

* https://github.com/Uniswap/uniswap-v3-core
