import assert from 'assert';
import { ethers } from 'ethers';
import { Config, getConfig } from '@vulcanize/util';
import { Database } from '../database';

export async function watch(configFile: string, address: string, kind: string, startingBlock: number): Promise<void> {
  const config: Config = await getConfig(configFile);
  const { database: dbConfig } = config;

  assert(dbConfig);

  const db = new Database(dbConfig);
  await db.init();

  // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
  const contractAddress = ethers.utils.getAddress(address);

  await db.saveContract(contractAddress, kind, startingBlock);
  await db.close();
  console.log('deployed');
}
