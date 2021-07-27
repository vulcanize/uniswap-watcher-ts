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
import { UNKNOWN_EVENT_NAME, Event } from './entity/Event';
import { QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, QUEUE_CHAIN_PRUNING } from './events';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: Indexer
  _jobQueue: JobQueue

  constructor (indexer: Indexer, jobQueue: JobQueue) {
    this._indexer = indexer;
    this._jobQueue = jobQueue;
  }

  async start (): Promise<void> {
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
    await this.subscribeChainPruningQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { data: { blockHash, blockNumber, parentHash, priority } } = job;

      log(`Processing block number ${blockNumber} hash ${blockHash} `);

      // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
      // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
      let syncStatus = await this._indexer.getSyncStatus();
      if (!syncStatus) {
        syncStatus = await this._indexer.updateSyncStatus(blockHash, blockNumber);
      }

      if (blockHash !== syncStatus.latestCanonicalBlockHash) {
        const parent = await this._indexer.getBlockProgress(parentHash);
        if (!parent) {
          const { number: parentBlockNumber, parent: { hash: grandparentHash } } = await this._indexer.getBlock(parentHash);

          // Create a higher priority job to index parent block and then abort.
          // We don't have to worry about aborting as this job will get retried later.
          const newPriority = (priority || 0) + 1;
          await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
            blockHash: parentHash,
            blockNumber: parentBlockNumber,
            parentHash: grandparentHash,
            priority: newPriority
          }, { priority: newPriority });

          const message = `Parent block number ${parentBlockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash} not fetched yet, aborting`;
          log(message);

          throw new Error(message);
        }

        if (parentHash !== syncStatus.latestCanonicalBlockHash && !parent.isComplete) {
          // Parent block indexing needs to finish before this block can be indexed.
          const message = `Indexing incomplete for parent block number ${parent.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
          log(message);

          throw new Error(message);
        }
      }

      const events = await this._indexer.getOrFetchBlockEvents(blockHash);
      for (let ei = 0; ei < events.length; ei++) {
        await this._jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { id: events[ei].id, publish: true });
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      const { data: { id } } = job;

      log(`Processing event ${id}`);

      let dbEvent = await this._indexer.getEvent(id);
      assert(dbEvent);

      const event: Event = dbEvent;

      // Confirm that the parent block has been completely processed.
      // We don't have to worry about aborting as this job will get retried later.
      const parent = await this._indexer.getBlockProgress(event.block.parentHash);
      if (!parent || !parent.isComplete) {
        const message = `Abort processing of event ${id} as parent block not processed yet`;
        throw new Error(message);
      }

      const blockProgress = await this._indexer.getBlockProgress(event.block.blockHash);
      assert(blockProgress);

      const events = await this._indexer.getBlockEvents(event.block.blockHash);
      const eventIndex = events.findIndex((e: any) => e.id === event.id);
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

      const uniContract = await this._indexer.isUniswapContract(event.contract);
      if (uniContract) {
        // We might not have parsed this event yet. This can happen if the contract was added
        // as a result of a previous event in the same block.
        if (event.eventName === UNKNOWN_EVENT_NAME) {
          const logObj = JSON.parse(event.extraInfo);
          const { eventName, eventInfo } = this._indexer.parseEventNameAndArgs(uniContract.kind, logObj);
          event.eventName = eventName;
          event.eventInfo = JSON.stringify(eventInfo);
          dbEvent = await this._indexer.saveEventEntity(event);
        }

        dbEvent = await this._indexer.getEvent(id);
        assert(dbEvent);

        await this._indexer.processEvent(dbEvent);
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeChainPruningQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_CHAIN_PRUNING, async (job) => {
      const { data: { pruneBlockHeight } } = job;

      log(`Processing chain pruning at ${pruneBlockHeight}`);
    });
  }
}

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
  const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint }, cache: cacheConfig } = upstream;
  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const indexer = new Indexer(config, db, ethClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  const jobRunner = new JobRunner(indexer, jobQueue);
  await jobRunner.start();
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
