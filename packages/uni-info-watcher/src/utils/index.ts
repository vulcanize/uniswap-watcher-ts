import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

export const exponentToBigDecimal = (decimals: bigint): Decimal => {
  let bd = new Decimal(1);

  for (let i = 0; BigNumber.from(decimals).gte(i); i++) {
    bd = bd.times(10);
  }

  return bd;
};

export const convertTokenToDecimal = (tokenAmount: bigint, exchangeDecimals: bigint): Decimal => {
  if (exchangeDecimals === BigInt(0)) {
    return new Decimal(tokenAmount.toString());
  }

  return (new Decimal(tokenAmount.toString())).div(exponentToBigDecimal(exchangeDecimals));
};
