//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

import { Pool } from './Pool';
import { Transaction } from './Transaction';
import { ADDRESS_ZERO } from '../utils/constants';
import { Position } from './Position';

@Entity()
export class PositionSnapshot {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('bigint')
  timestamp!: BigInt;

  @Column('bigint')
  feeGrowthInside0LastX128!: bigint

  @Column('bigint')
  feeGrowthInside1LastX128!: bigint

  @Column('bigint', { default: BigInt(0) })
  liquidity!: bigint

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  depositedToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  depositedToken1!: Decimal

  @Column('varchar', { length: 42, default: ADDRESS_ZERO })
  owner!: string

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  withdrawnToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  withdrawnToken1!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  collectedFeesToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  collectedFeesToken1!: Decimal

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  position!: Position

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  transaction!: Transaction
}
