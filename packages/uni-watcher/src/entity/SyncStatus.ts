//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

import { SyncStatusInterface } from '@vulcanize/util';

@Entity()
export class SyncStatus implements SyncStatusInterface {
  @PrimaryGeneratedColumn()
  id!: number;

  // Latest block hash and number from the chain itself.
  @Column('varchar', { length: 66 })
  chainHeadBlockHash!: string;

  @Column('integer')
  chainHeadBlockNumber!: number;

  // Most recent block hash that's been indexed.
  @Column('varchar', { length: 66 })
  latestIndexedBlockHash!: string;

  // Most recent block number that's been indexed.
  @Column('integer')
  latestIndexedBlockNumber!: number;

  // Most recent block hash and number that we can consider as part
  // of the canonical/finalized chain. Reorgs older than this block
  // cannot be processed and processing will halt.
  @Column('varchar', { length: 66 })
  latestCanonicalBlockHash!: string;

  @Column('integer')
  latestCanonicalBlockNumber!: number;

  @Column('varchar', { length: 66, default: '0xf1156cb7e1a2acaa348c66fdc45b02f2547024ded63350a96a46ed12c62b4ff4' })
  initialIndexedBlockHash!: string;

  @Column('integer', { default: 12369621 })
  initialIndexedBlockNumber!: number;
}
