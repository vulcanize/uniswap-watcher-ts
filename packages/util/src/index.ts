//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';

import { MAX_REORG_DEPTH } from './constants';
import { IndexerInterface } from './types';

/**
 * Method to wait for specified time.
 * @param time Time to wait in milliseconds
 */
export const wait = async (time: number): Promise<void> => new Promise(resolve => setTimeout(resolve, time));

/**
 * Method to perform chain pruning at the specified block height.
 * @param pruneBlockHeight Height at which blocks are to be pruned.
 * @param indexer Indexer object.
 * @param log Debugger object for logging.
 */
export const pruneChainAtHeight = async (pruneBlockHeight: number, indexer: IndexerInterface, log: debug.Debugger): Promise<void> => {
  log(`Processing chain pruning at ${pruneBlockHeight}`);

  // Assert we're at a depth where pruning is safe.
  const syncStatus = await indexer.getSyncStatus();
  assert(syncStatus);
  assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

  // Check that we haven't already pruned at this depth.
  if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
    log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
  } else {
    // Check how many branches there are at the given height/block number.
    const blocksAtHeight = await indexer.getBlocksAtHeight(pruneBlockHeight, false);

    // Should be at least 1.
    assert(blocksAtHeight.length);

    // We have more than one node at this height, so prune all nodes not reachable from head.
    // This will lead to orphaned nodes, which will get pruned at the next height.
    if (blocksAtHeight.length > 1) {
      for (let i = 0; i < blocksAtHeight.length; i++) {
        const block = blocksAtHeight[i];
        // If this block is not reachable from the latest indexed block, mark it as pruned.
        const isAncestor = await indexer.blockIsAncestor(block.blockHash, syncStatus.latestIndexedBlockHash, MAX_REORG_DEPTH);
        if (!isAncestor) {
          await indexer.markBlockAsPruned(block);
        }
      }
    }
  }
};
