import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { getConfig, JobQueue } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';
import { QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string'
    })
    .argv;

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { gqlEndpoint, gqlSubscriptionEndpoint, traceProviderEndpoint, cache: cacheConfig } = upstream;
  assert(gqlEndpoint, 'Missing upstream gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream gqlSubscriptionEndpoint');
  assert(traceProviderEndpoint, 'Missing upstream traceProviderEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({ gqlEndpoint, gqlSubscriptionEndpoint, cache });

  const indexer = new Indexer(config, db, ethClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  await jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
    const { data: { blockHash } } = job;

    const events = await indexer.getBlockEvents(blockHash);
    for (let ei = 0; ei < events.length; ei++) {
      const eventObj = events[ei];
      await jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { blockHash: eventObj.blockHash, id: eventObj.id });
    }

    await jobQueue.markComplete(job);
  });

  await jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
    const { data: { id } } = job;

    const event = await indexer.getEvent(id);
    assert(event);

    const uniContract = await indexer.isUniswapContract(event.contract);
    if (uniContract) {
      // TODO: We might not have parsed this event yet.
      // if (event.eventName === 'unknown') {
      //   const eventDetails = indexer.parseEventNameAndArgs(uniContract.kind, logObj);
      //   eventName = eventDetails.eventName;
      //   eventInfo = eventDetails.eventInfo;
      // }

      indexer.processEvent(event);
    }

    await jobQueue.markComplete(job);
  });
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});
