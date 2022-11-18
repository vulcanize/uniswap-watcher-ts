//
// Copyright 2021 Vulcanize, Inc.
//

import { DeepPartial } from 'typeorm';

import { IndexerInterface as BaseIndexerInterface, BlockProgressInterface, EventInterface } from '@cerc-io/util';

export interface IndexerInterface extends BaseIndexerInterface {
  saveBlockProgress (block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface>
  saveEvents (dbEvents: EventInterface[]): Promise<void>
}
