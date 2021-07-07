import { Entity, PrimaryColumn, Column, Index, ManyToOne } from 'typeorm';
import { Pool } from './Pool';

@Entity()
@Index(['blockNumber', 'id'])
export class PoolDayData {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('numeric')
  blockNumber!: number;

  @PrimaryColumn('integer')
  date!: number;

  @ManyToOne(() => Pool)
  pool!: Pool;

  @PrimaryColumn('numeric')
  high!: number;

  @PrimaryColumn('numeric')
  low!: number;

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
  token0Price!: number

  @Column('numeric', { default: 0 })
  token1Price!: number

  @Column('numeric', { default: 0 })
  tvlUSD!: number

  @Column('numeric', { default: BigInt(0) })
  txCount!: bigint

  // TODO: Add remaining fields when they are used.
}
