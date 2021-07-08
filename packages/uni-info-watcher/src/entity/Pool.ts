import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';

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

  @Column('numeric', { default: 0 })
  token0Price!: number

  @Column('numeric', { default: 0 })
  token1Price!: number

  @Column('numeric')
  feeTier!: bigint

  @Column('numeric', { default: BigInt(0) })
  sqrtPrice!: bigint

  @Column('numeric', { default: BigInt(0) })
  tick!: bigint

  @Column('numeric', { default: BigInt(0) })
  liquidity!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal0X128!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal1X128!: bigint

  @Column('numeric', { default: 0 })
  totalValueLockedUSD!: number

  @Column('numeric', { default: 0 })
  totalValueLockedToken0!: number

  @Column('numeric', { default: 0 })
  totalValueLockedToken1!: number

  // TODO: Add remaining fields when they are used.
}
