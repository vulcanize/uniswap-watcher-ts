import { BigNumber } from 'ethers';

import { Database } from '../database';
import { PoolDayData } from '../entity/PoolDayData';

export const updatePoolDayData = async (db: Database, event: { contractAddress: string, blockNumber: number }): Promise<PoolDayData> => {
  const { contractAddress, blockNumber } = event;

  // TODO: Get timestamp from event block.
  // let timestamp = event.block.timestamp.toI32()
  const timestamp = Date.now();

  const dayID = Math.floor(timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;

  const dayPoolID = contractAddress
    .concat('-')
    .concat(dayID.toString());

  const pool = await db.loadPool({ id: contractAddress, blockNumber });

  let poolDayData = await db.loadPoolDayData({
    id: dayPoolID,
    blockNumber,
    date: dayStartTimestamp,
    pool: pool
  });

  if (Number(pool.token0Price) > Number(poolDayData.high)) {
    poolDayData.high = pool.token0Price;
  }

  if (Number(pool.token0Price) < Number(poolDayData.low)) {
    poolDayData.low = pool.token0Price;
  }

  poolDayData.liquidity = pool.liquidity;
  poolDayData.sqrtPrice = pool.sqrtPrice;
  poolDayData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128;
  poolDayData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128;
  poolDayData.token0Price = pool.token0Price;
  poolDayData.token1Price = pool.token1Price;
  poolDayData.tick = pool.tick;
  poolDayData.tvlUSD = pool.totalValueLockedUSD;
  poolDayData.txCount = BigInt(BigNumber.from(poolDayData.txCount).add(1).toHexString());
  poolDayData = await db.savePoolDayData(poolDayData, blockNumber);

  return poolDayData;
};
