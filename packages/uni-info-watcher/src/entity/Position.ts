//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';
import { Token } from './Token';
import { Tick } from './Tick';
import { Transaction } from './Transaction';
import { ADDRESS_ZERO } from '../utils/constants';

@Entity()
@Index(['id', 'blockNumber'])
export class Position {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  feeGrowthInside0LastX128!: bigint

  @Column('numeric', { transformer: bigintTransformer })
  feeGrowthInside1LastX128!: bigint

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  liquidity!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  depositedToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  depositedToken1!: GraphDecimal

  @Column('varchar', { length: 42, default: ADDRESS_ZERO })
  owner!: string

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  withdrawnToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  withdrawnToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken1!: GraphDecimal

  @Column('varchar', { length: 42, nullable: true })
  poolId!: string;

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool

  @Column('varchar', { length: 42, nullable: true })
  token0Id!: string;

  @ManyToOne(() => Token)
  token0!: Token

  @Column('varchar', { length: 42, nullable: true })
  token1Id!: string;

  @ManyToOne(() => Token)
  token1!: Token

  @Column('varchar', { nullable: true })
  tickLowerId!: string;

  @ManyToOne(() => Tick)
  tickLower!: Tick

  @Column('varchar', { nullable: true })
  tickUpperId!: string;

  @ManyToOne(() => Tick)
  tickUpper!: Tick

  @Column('varchar', { nullable: true })
  transactionId!: string;

  @ManyToOne(() => Transaction)
  transaction!: Transaction
}
