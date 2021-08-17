//
// Copyright 2021 Vulcanize, Inc.
//

/**
 * Method to wait for specified time.
 * @param time Time to wait in milliseconds
 */
export const wait = async (time: number): Promise<void> => new Promise(resolve => setTimeout(resolve, time));

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
}

export interface DatabaseInterface {
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>
}
