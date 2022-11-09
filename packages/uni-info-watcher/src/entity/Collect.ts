//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
export class Collect {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  transaction!: string

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint

  @Column('varchar', { length: 42 })
  pool!: string

  @Column('varchar', { length: 42 })
  owner!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amountUSD!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  tickLower!: bigint

  @Column('numeric', { transformer: bigintTransformer })
  tickUpper!: bigint

  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  logIndex!: bigint

  @Column('boolean', { default: false })
  isPruned!: boolean
}
