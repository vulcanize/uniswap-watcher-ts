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

## References

* https://github.com/Uniswap/uniswap-v3-core
