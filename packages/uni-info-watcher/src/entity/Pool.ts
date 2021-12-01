//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

import { Token } from './Token';

@Entity()
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token0!: Token;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token1!: Token;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  token0Price!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  token1Price!: GraphDecimal

  @Column('numeric')
  feeTier!: bigint

  @Column('numeric', { default: BigInt(0) })
  sqrtPrice!: bigint

  @Column('bigint', { nullable: true })
  tick!: bigint | null

  @Column('numeric', { default: BigInt(0) })
  liquidity!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal0X128!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal1X128!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedETH!: GraphDecimal

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  untrackedVolumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal

  // TODO: Add remaining fields when they are used.
}
