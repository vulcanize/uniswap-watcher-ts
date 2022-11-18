//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { graphDecimalTransformer, bigintTransformer, GraphDecimal } from '@cerc-io/util';

@Entity()
@Index(['id', 'blockNumber'])
export class Flash {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  transaction!: string;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('varchar')
  pool!: string

  @Column('varchar', { length: 42 })
  sender!: string

  @Column('varchar', { length: 42 })
  recipient!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amountUSD!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount0Paid!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount1Paid!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  logIndex!: bigint

  @Column('boolean', { default: false })
  isPruned!: boolean
}
