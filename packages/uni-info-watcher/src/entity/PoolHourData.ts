import Decimal from 'decimal.js';
import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';

import { decimalTransformer } from '../utils/database';
import { Pool } from './Pool';

@Entity()
export class PoolHourData {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('integer')
  periodStartUnix!: number;

  @ManyToOne(() => Pool)
  pool!: Pool;

  @Column('numeric', { transformer: decimalTransformer })
  high!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  low!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  open!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  close!: Decimal;

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
  token0Price!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  token1Price!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  tvlUSD!: Decimal

  @Column('numeric', { default: BigInt(0) })
  txCount!: bigint

  // TODO: Add remaining fields when they are used.
}