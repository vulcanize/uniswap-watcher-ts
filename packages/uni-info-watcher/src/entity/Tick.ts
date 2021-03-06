//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
export class Tick {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  tickIdx!: bigint;

  @Column('varchar', { length: 42 })
  pool!: string;

  @Column('varchar', { length: 42 })
  poolAddress!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  price0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  price1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityGross!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityNet!: bigint
}
