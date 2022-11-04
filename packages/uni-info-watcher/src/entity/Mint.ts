//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
@Index(['transaction'])
@Index(['blockHash', 'id', 'token0'])
@Index(['blockHash', 'id', 'token1'])
export class Mint {
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
  sender!: string

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
}
