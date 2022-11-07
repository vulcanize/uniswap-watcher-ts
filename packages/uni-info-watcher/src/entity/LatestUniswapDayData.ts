//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class LatestUniswapDayData {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  latestBlockHash!: string;

  @Column('integer')
  latestBlockNumber!: number;

  @Column('integer')
  date!: number
}
