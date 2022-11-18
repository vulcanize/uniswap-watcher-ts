//
// Copyright 2021 Vulcanize, Inc.
//

import { IndexerInterface as BaseIndexerInterface, EventInterface } from '@cerc-io/util';

export interface IndexerInterface extends BaseIndexerInterface {
  saveEvents (dbEvents: EventInterface[]): Promise<void>
}
