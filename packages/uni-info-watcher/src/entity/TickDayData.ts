//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne, Index } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';
import { Tick } from './Tick';

@Entity()
@Index(['id', 'blockNumber'])
export class TickDayData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @Column('varchar', { length: 42, nullable: true })
  poolId!: string;

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool;

  @Column('varchar', { nullable: true })
  tickId!: string;

  @ManyToOne(() => Tick, { onDelete: 'CASCADE' })
  tick!: Tick

  @Column('numeric', { transformer: bigintTransformer })
  liquidityGross!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  liquidityNet!: bigint;
}
