//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';
import { Between } from 'typeorm';

import { prepareEntityState } from '@cerc-io/graph-node';

import { Indexer } from '../indexer';
import { Database } from '../database';
import { FACTORY_ADDRESS } from '../utils/constants';

const log = debug('vulcanize:fill-state');

const ENTITY_NAMES = ['Bundle', 'Burn', 'Factory', 'Mint', 'Pool', 'PoolDayData', 'PoolHourData', 'Position', 'PositionSnapshot', 'Swap', 'Tick', 'TickDayData', 'Token', 'TokenDayData', 'TokenHourData', 'Transaction', 'UniswapDayData'];

export const fillState = async (
  indexer: Indexer,
  db: Database,
  argv: {
    startBlock: number,
    endBlock: number
  }
): Promise<void> => {
  const { startBlock, endBlock } = argv;
  if (startBlock > endBlock) {
    log('endBlock should be greater than or equal to startBlock');
    process.exit(1);
  }

  // NOTE: Assuming all blocks in the given range are in the pruned region
  log(`Filling state for subgraph entities in range: [${startBlock}, ${endBlock}]`);

  // Check that there are no existing diffs in this range
  const existingStates = await indexer.getStates({ block: { blockNumber: Between(startBlock, endBlock) } });
  if (existingStates.length > 0) {
    log('found existing state(s) in the given range');
    process.exit(1);
  }

  // Map: contractAddress -> entity names
  // Using Factory contract to store state for all entities.
  const contractEntitiesMap: Map<string, string[]> = new Map([
    [
      FACTORY_ADDRESS,
      ENTITY_NAMES
    ]
  ]);

  console.time('time:fill-state');

  // Fill state for blocks in the given range
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.time(`time:fill-state-${blockNumber}`);

    // Get the canonical block hash at current height
    const blocks = await indexer.getBlocksAtHeight(blockNumber, false);

    if (blocks.length === 0) {
      log(`block not found at height ${blockNumber}`);
      process.exit(1);
    } else if (blocks.length > 1) {
      log(`found more than one non-pruned block at height ${blockNumber}`);
      process.exit(1);
    }

    const blockHash = blocks[0].blockHash;

    // Create initial state for contracts
    await indexer.createInit(blockHash, blockNumber);

    // Fill state for each contract in contractEntitiesMap
    const contractStatePromises = Array.from(contractEntitiesMap.entries())
      .map(async ([contractAddress, entities]): Promise<void> => {
        // Get all the updated entities at this block
        const updatedEntitiesListPromises = entities.map(async (entity): Promise<any[]> => {
          return indexer.getEntitiesForBlock(blockHash, entity);
        });
        const updatedEntitiesList = await Promise.all(updatedEntitiesListPromises);

        // Populate state with all the updated entities of each entity type
        updatedEntitiesList.forEach((updatedEntities, index) => {
          const entityName = entities[index];

          updatedEntities.forEach((updatedEntity) => {
            // Prepare diff data for the entity update
            const diffData = prepareEntityState(updatedEntity, entityName, db.relationsMap);

            // Update the in-memory subgraph state
            indexer.updateEntityState(contractAddress, diffData);
          });
        });
      });

    await Promise.all(contractStatePromises);

    // Persist subgraph state to the DB
    await indexer.dumpEntityState(blockHash, true);
    await indexer.updateStateSyncStatusIndexedBlock(blockNumber);

    // Create checkpoints
    await indexer.processCheckpoint(blockHash);
    await indexer.updateStateSyncStatusCheckpointBlock(blockNumber);

    console.timeEnd(`time:fill-state-${blockNumber}`);
  }

  console.timeEnd('time:fill-state');

  log(`Filled state for subgraph entities in range: [${startBlock}, ${endBlock}]`);
};
