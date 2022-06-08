//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import yargs from 'yargs';
import assert from 'assert';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { getConfig } from '../config';
import { getCustomProvider } from '../misc';

const log = debug('vulcanize:check-config');

const main = async () => {
  const argv = await yargs.options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)'
    }
  }).argv;

  const { upstream: { ethServer: { gqlApiEndpoint, rpcProviderEndpoint } } } = await getConfig(argv.configFile);

  // Get latest block in chain using ipld-eth-server GQL.
  log(`Checking ipld-eth-server GQL endpoint ${gqlApiEndpoint}`);
  const ethClient = new EthClient({ gqlEndpoint: gqlApiEndpoint, cache: undefined });
  const { block: currentBlock } = await ethClient.getBlockByHash();
  assert(currentBlock && currentBlock.number);
  log('ipld-eth-server GQL endpoint working');

  // Get block by hash using RPC endpoint.
  log(`Checking RPC endpoint ${rpcProviderEndpoint}`);
  const ethProvider = getCustomProvider(rpcProviderEndpoint);
  const ethBlock = await ethProvider.getBlock(currentBlock.hash);
  assert(ethBlock.number === currentBlock.number);
  log('RPC endpoint working');
};

main().then(() => {
  process.exit();
}).catch(error => {
  log(error);
});
