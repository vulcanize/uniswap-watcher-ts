//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
@Index(['transaction'])
export class Swap {
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
  sender!: string

  @Column('varchar', { length: 42 })
  origin!: string

  @Column('varchar', { length: 42 })
  recipient!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amountUSD!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  tick!: bigint

  @Column('numeric', { transformer: bigintTransformer })
  sqrtPriceX96!: bigint

  // Field is nullable to work with old DB schema.
  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  logIndex!: bigint
}
