import { Database } from '../database';

const USDC_WETH_03_POOL = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';

export const getEthPriceInUSD = async (db: Database): Promise<number> => {
  // fetch eth prices for each stablecoin
  const usdcPool = await db.getPool({ id: USDC_WETH_03_POOL }); // dai is token0

  if (usdcPool) {
    return usdcPool.token0Price;
  } else {
    return 0;
  }
};
