import { BigNumber } from 'ethers';

export const exponentToBigDecimal = (decimals: bigint): number => {
  let bd = 1;

  for (let i = 0; BigNumber.from(decimals).gte(i); i++) {
    bd = bd * 10;
  }

  return bd;
};

export const convertTokenToDecimal = (tokenAmount: bigint, exchangeDecimals: bigint): number => {
  // TODO: Use external library like BigDecimal to perform operations.
  if (exchangeDecimals === BigInt(0)) {
    return Number(tokenAmount);
  }

  return Number(tokenAmount) / exponentToBigDecimal(exchangeDecimals);
};
