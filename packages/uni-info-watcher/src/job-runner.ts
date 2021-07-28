import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getConfig, JobQueue } from '@vulcanize/util';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';
import { Database } from './database';
import { QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING } from './events';
import { Event } from './entity/Event';

const log = debug('vulcanize:job-runner');

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
  const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint }, tokenWatcher, cache: cacheConfig, ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint } } = upstream;
  assert(gqlEndpoint, 'Missing upstream uniWatcher.gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream uniWatcher.gqlSubscriptionEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  const erc20Client = new ERC20Client(tokenWatcher);

  const indexer = new Indexer(db, uniClient, erc20Client, ethClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  await jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
    const { data: { block, priority } } = job;
    log(`Processing block hash ${block.hash} number ${block.number}`);

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
    let syncStatus = await indexer.getSyncStatus();
    if (!syncStatus) {
      syncStatus = await indexer.updateSyncStatus(block.hash, block.number);
    }

    if (block.hash !== syncStatus.latestCanonicalBlockHash) {
      const parent = await indexer.getBlockProgress(block.parentHash);
      if (!parent) {
        const { number: parentBlockNumber, parent: { hash: grandparentHash }, timestamp: parentTimestamp } = await indexer.getBlock(block.parentHash);

        // Create a higher priority job to index parent block and then abort.
        // We don't have to worry about aborting as this job will get retried later.
        const newPriority = (priority || 0) + 1;
        await jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          block: {
            hash: block.parentHash,
            number: parentBlockNumber,
            parentHash: grandparentHash,
            timestamp: parentTimestamp
          },
          priority: newPriority
        }, { priority: newPriority });

        const message = `Parent block number ${parentBlockNumber} hash ${block.parentHash} of block number ${block.number} hash ${block.hash} not fetched yet, aborting`;
        log(message);

        throw new Error(message);
      }

      if (block.parentHash !== syncStatus.latestCanonicalBlockHash && !parent.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parent.blockNumber} hash ${block.parentHash} of block number ${block.number} hash ${block.hash}, aborting`;
        log(message);

        throw new Error(message);
      }
    }

    // Check if block is being already processed.
    const blockProgress = await indexer.getBlockProgress(block.hash);
    if (!blockProgress) {
      const events = await indexer.getOrFetchBlockEvents(block);

      for (let ei = 0; ei < events.length; ei++) {
        const { id } = events[ei];
        await jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { id });
      }
    }

    await jobQueue.markComplete(job);
  });

  await jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
    const { data: { id } } = job;

    log(`Processing event ${id}`);
    const dbEvent = await db.getEvent(id);
    assert(dbEvent);

    const event: Event = dbEvent;

    // Confirm that the parent block has been completely processed.
    // We don't have to worry about aborting as this job will get retried later.
    const parent = await indexer.getBlockProgress(event.block.parentHash);
    if (!parent || !parent.isComplete) {
      const message = `Abort processing of event ${id} as parent block not processed yet`;
      throw new Error(message);
    }

    const blockProgress = await indexer.getBlockProgress(event.block.blockHash);
    assert(blockProgress);

    const events = await indexer.getBlockEvents(event.block.blockHash);
    const eventIndex = events.findIndex(e => e.id === event.id);
    assert(eventIndex !== -1);

    // Check if previous event in block has been processed exactly before this and abort if not.
    if (eventIndex > 0) { // Skip the first event in the block.
      const prevIndex = eventIndex - 1;
      const prevEvent = events[prevIndex];
      if (prevEvent.index !== blockProgress.lastProcessedEventIndex) {
        throw new Error(`Events received out of order for block number ${event.block.blockNumber} hash ${event.block.blockHash},` +
        ` prev event index ${prevEvent.index}, got event index ${event.index} and lastProcessedEventIndex ${blockProgress.lastProcessedEventIndex}, aborting`);
      }
    }

    // Check if event is processed.
    if (!dbEvent.block.isComplete && event.index !== blockProgress.lastProcessedEventIndex) {
      await indexer.processEvent(dbEvent);
    }

    await jobQueue.markComplete(job);
  });
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
