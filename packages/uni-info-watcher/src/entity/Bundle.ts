//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { GraphDecimal, graphDecimalTransformer } from '@cerc-io/util';

@Entity()
@Index(['id', 'blockNumber'])
export class Bundle {
  @PrimaryColumn('varchar', { length: 1 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  ethPriceUSD!: GraphDecimal

  @Column('boolean', { default: false })
  isPruned!: boolean
}
