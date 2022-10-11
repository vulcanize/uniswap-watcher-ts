//
// Copyright 2021 Vulcanize, Inc.
//

import { DeepPartial } from 'typeorm';

import { IndexerInterface as BaseIndexerInterface } from '@cerc-io/util';

export interface BlockProgressInterface {
  id: number;
  cid: string;
  blockHash: string;
  parentHash: string;
  blockNumber: number;
  blockTimestamp: number;
  numEvents: number;
  numProcessedEvents: number;
  lastProcessedEventIndex: number;
  isComplete: boolean;
  isPruned: boolean;
  createdAt: Date;
}

export interface SyncStatusInterface {
  id: number;
  chainHeadBlockHash: string;
  chainHeadBlockNumber: number;
  latestIndexedBlockHash: string;
  latestIndexedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;
  initialIndexedBlockHash: string;
  initialIndexedBlockNumber: number;
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

export interface ContractInterface {
  id: number;
  address: string;
  startingBlock: number;
  kind: string;
  checkpoint: boolean;
}

export interface IndexerInterface extends BaseIndexerInterface {
  saveBlockProgress (block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface>
  saveEvents (dbEvents: EventInterface[]): Promise<void>;
}

export interface EventWatcherInterface {
  getBlockProgressEventIterator (): AsyncIterator<any>
  initBlockProcessingOnCompleteHandler (): Promise<void>
  initEventProcessingOnCompleteHandler (): Promise<void>
}
