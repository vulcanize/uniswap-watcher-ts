//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
export class Tick {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  tickIdx!: bigint;

  @Column('varchar', { length: 42 })
  pool!: string;

  @Column('varchar', { length: 42 })
  poolAddress!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  price0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  price1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityGross!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityNet!: bigint

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

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesUSD!: GraphDecimal

  // Field is nullable to work with old DB schema.
  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  createdAtTimestamp!: bigint

  // Field is nullable to work with old DB schema.
  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  createdAtBlockNumber!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityProviderCount!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  feeGrowthOutside0X128!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  feeGrowthOutside1X128!: bigint
}
