//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['id', 'blockHash'])
export class LatestTokenHourData {
  @PrimaryColumn('varchar')
    id!: string;

  @Column('varchar', { length: 66 })
    blockHash!: string;

  @Column('integer')
    blockNumber!: number;

  @Column('integer')
    periodStartUnix!: number;

  @Column('varchar', { length: 42 })
    token!: string;
}
