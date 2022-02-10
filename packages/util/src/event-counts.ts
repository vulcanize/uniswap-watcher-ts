import fetch from 'node-fetch';

import yargs from 'yargs';
import assert from 'assert';

import { wait } from './misc';

const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const nfpmAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

const factoryEventSignatureMap = {
  PoolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118'
};

const nfpmEventSignatureMap = {
  IncreaseLiquidity: '0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f',
  DecreaseLiquidity: '0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4',
  Collect: '0x40d0efd1a53d60ecbf40971b9daf7dc90178c3aadc7aab1765632738fa8b8f01',
  Transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
};

const poolEventSignatureMap = {
  Initialize: '0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95',
  Mint: '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
  Burn: '0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c',
  Swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
};

// Etherscan API limitation
const resultSizeLimit = 1000;

// Run: yarn event-counts --api-key <API-key>
async function main () {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    startBlock: {
      type: 'number',
      default: 12369621,
      describe: 'Start block'
    },
    endBlock: {
      type: 'number',
      default: 14171509,
      describe: 'End block'
    },
    sampleSize: {
      type: 'number',
      default: 50,
      describe: 'Sample size'
    },
    interval: {
      type: 'number',
      default: 100000,
      describe: 'Interval'
    },
    apiKey: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Etherscan API key'
    }
  }).argv;

  console.log('Start block: ', argv.startBlock);
  console.log('End block: ', argv.endBlock);
  console.log('Sample size: ', argv.sampleSize);
  console.log('Interval: ', argv.interval);

  // Counts for the events in order:
  // PoolCreated, IncreaseLiquidity, DecreaseLiquidity, Collect, Transfer, Initialize, Mint, Burn, Swap
  const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const prevCounts:number[] = new Array(7);

  // Total number of blocks to be processed
  const numberOfBlocks = argv.endBlock - argv.startBlock + 1;

  // Block range to query for
  let fromBlock = argv.startBlock;
  let toBlock = fromBlock + argv.sampleSize;

  // Continue till endBlock
  while (toBlock <= argv.endBlock) {
    let data: any[] = [];

    // Fetch factory events
    const factoryResponsePromise = fetch(`https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${factoryAddress}&topic0=${factoryEventSignatureMap.PoolCreated}&apikey=${argv.apiKey}`);

    // Fetch NFPM events
    const nfpmResponsePromises = Object.values(nfpmEventSignatureMap).map(signature => {
      return fetch(`https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${nfpmAddress}&topic0=${signature}&apikey=${argv.apiKey}`);
    });

    let responses = await Promise.all([...[factoryResponsePromise], ...nfpmResponsePromises]);
    let dataPromises = responses.map(response => {
      return response.json();
    });

    let responseData = await Promise.all(dataPromises);
    data = data.concat(responseData);

    // Wait for 1 sec according to API restrictions
    await wait(1000);

    const poolResponsePromises = Object.values(poolEventSignatureMap).map(signature => {
      return fetch(`https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&topic0=${signature}&apikey=${argv.apiKey}`);
    });

    responses = await Promise.all([...poolResponsePromises]);
    dataPromises = responses.map(response => {
      return response.json();
    });

    responseData = await Promise.all(dataPromises);
    data = data.concat(responseData);

    // TODO: cache API response data
    // Increment event counts
    data.forEach((obj: any, index: number) => {
      assert(Array.isArray(obj.result), `Result "${obj.result}" is not an array`);

      if (obj.result.length === resultSizeLimit) {
        console.log(`WARNING: Result size reached limit (${resultSizeLimit}). Estimates might not be correct. Please reduce sample size.`);
      }

      if (prevCounts[index] === undefined) {
        counts[index] = obj.result.length;
      } else {
        const meanCount = (prevCounts[index] + obj.result.length) / 2;
        counts[index] = counts[index] + Math.round(meanCount / argv.sampleSize * argv.interval);
      }

      prevCounts[index] = obj.result.length;
    });

    // TODO: save event counts in a CSV file
    const totalEvents = counts.reduce((a, b) => {
      return a + b;
    }, 0);

    console.log(`Event counts till block ${fromBlock}:`, ...counts);
    console.log('Total:', totalEvents);

    // Wait for 1 sec according to API restrictions
    await wait(1000);

    const blocksProcessed = fromBlock - argv.startBlock + 1;
    const completePercentage = Math.round(blocksProcessed / numberOfBlocks * 100);
    console.log(`Processed ${blocksProcessed} of ${numberOfBlocks} blocks (${completePercentage}%)`);

    fromBlock = fromBlock + argv.interval;
    toBlock = fromBlock + argv.sampleSize;
  }
}

main().then(() => {
  process.exit();
}).catch(err => {
  console.log(err);
});
