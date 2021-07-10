import Decimal from 'decimal.js';
import { Entity, Column, PrimaryColumn } from 'typeorm';

import { decimalTransformer } from '../utils/database';

@Entity()
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('bigint', { default: BigInt(0) })
  poolCount!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedETH!: Decimal;

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedUSD!: Decimal;

  // TODO: Add remaining fields when they are used.
}