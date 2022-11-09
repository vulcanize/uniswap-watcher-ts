//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { bigintTransformer, GraphDecimal, graphDecimalTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
export class TickHourData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  pool!: string;

  @Column('varchar')
  tick!: string;

  @Column('numeric', { transformer: bigintTransformer })
  liquidityGross!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  liquidityNet!: bigint;

  @Column('integer')
  periodStartUnix!: number

  @Column('numeric', { transformer: graphDecimalTransformer })
  volumeToken0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  volumeToken1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal

  @Column('boolean', { default: false })
  isPruned!: boolean
}
