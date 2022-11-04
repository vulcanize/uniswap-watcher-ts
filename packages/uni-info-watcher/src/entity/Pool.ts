//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  token0!: string;

  @Column('varchar', { length: 42 })
  token1!: string;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  token0Price!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  token1Price!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  feeTier!: bigint

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  sqrtPrice!: bigint

  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  tick!: bigint | null

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  liquidity!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedETH!: GraphDecimal

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
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

  // Field is nullable to work with old DB schema.
  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  createdAtTimestamp!: bigint

  // Field is nullable to work with old DB schema.
  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  createdAtBlockNumber!: bigint

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  observationIndex!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSDUntracked!: GraphDecimal

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  liquidityProviderCount!: bigint

  // Skipping fee growth as they are not queried.
  // @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  // feeGrowthGlobal0X128!: bigint

  // @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  // feeGrowthGlobal1X128!: bigint
}
