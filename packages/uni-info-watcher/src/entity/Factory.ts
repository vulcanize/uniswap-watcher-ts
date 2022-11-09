//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';
import { ADDRESS_ZERO } from '../utils/constants';

@Entity()
@Index(['id', 'blockNumber'])
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  poolCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedETH!: GraphDecimal;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalVolumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalVolumeETH!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalFeesUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalFeesETH!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  untrackedVolumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSDUntracked!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedETHUntracked!: GraphDecimal

  @Column('varchar', { length: 42, default: ADDRESS_ZERO })
  owner!: string

  @Column('boolean', { default: false })
  isPruned!: boolean
}
