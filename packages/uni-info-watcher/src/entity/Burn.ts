//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer, graphDecimalTransformer } from '@vulcanize/util';
import { GraphDecimal } from '@cerc-io/util';

@Entity()
@Index(['id', 'blockNumber'])
@Index(['transaction'])
@Index(['timestamp'])
export class Burn {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  transaction!: string;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('varchar', { length: 42 })
  pool!: string;

  @Column('varchar', { length: 42 })
  token0!: string

  @Column('varchar', { length: 42 })
  token1!: string

  @Column('varchar', { length: 42 })
  owner!: string

  @Column('varchar', { length: 42 })
  origin!: string

  @Column('numeric', { transformer: bigintTransformer })
  amount!: bigint

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

  // Field is nullable to work with old DB schema.
  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  logIndex!: bigint

  @Column('boolean', { default: false })
  isPruned!: boolean
}
