import { ethers } from 'ethers';

export const getTrace = async (providerUrl: string, txHash: string, tracer: string | undefined): Promise<any> => {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  return provider.send('debug_traceTransaction', [txHash, { tracer }]);
};
