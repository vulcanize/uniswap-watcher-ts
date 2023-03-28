//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['id', 'blockHash'])
export class LatestTick {
  @PrimaryColumn('varchar')
    id!: string;

  @Column('varchar', { length: 66 })
    blockHash!: string;

  @Column('integer')
    blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
    tickIdx!: bigint;

  @Column('varchar', { length: 42 })
    poolAddress!: string;
}
