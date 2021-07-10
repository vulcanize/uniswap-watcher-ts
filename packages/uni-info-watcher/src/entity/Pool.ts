import Decimal from 'decimal.js';
import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';

import { decimalTransformer } from '../utils/database';
import { Token } from './Token';

@Entity()
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @ManyToOne(() => Token)
  token0!: Token;

  @ManyToOne(() => Token)
  token1!: Token;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  token0Price!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  token1Price!: Decimal

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

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedToken1!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedETH!: Decimal

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  // TODO: Add remaining fields when they are used.
}