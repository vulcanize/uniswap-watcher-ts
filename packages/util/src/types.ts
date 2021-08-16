//
// Copyright 2021 Vulcanize, Inc.
//

export interface BlockProgressInterface {
  id: number;
  blockHash: string;
  parentHash: string;
  blockNumber: number;
  blockTimestamp: number;
  numEvents: number;
  numProcessedEvents: number;
  lastProcessedEventIndex: number;
  isComplete: boolean;
  isPruned: boolean;
}

export interface SyncStatusInterface {
  id: number;
  chainHeadBlockHash: string;
  chainHeadBlockNumber: number;
  latestIndexedBlockHash: string;
  latestIndexedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;
}

export interface EventInterface {
  id: number;
  block: BlockProgressInterface;
  txHash: string;
  index: number;
  contract: string;
  eventName: string;
  eventInfo: string;
  extraInfo: string;
  proof: string;
}

export interface IndexerInterface {
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>
  getEvent (id: string): Promise<EventInterface | undefined>
  updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void>
  getSyncStatus (): Promise<SyncStatusInterface | undefined>;
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>;
  blockIsAncestor (ancestorBlockHash: string, blockHash: string, maxDepth: number): Promise<boolean>;
  markBlockAsPruned (block: BlockProgressInterface): Promise<BlockProgressInterface>;
}

export interface EventWatcherInterface {
  getBlockProgressEventIterator (): AsyncIterator<any>
  initBlockProcessingOnCompleteHandler (): Promise<void>
  initEventProcessingOnCompleteHandler (): Promise<void>
}
