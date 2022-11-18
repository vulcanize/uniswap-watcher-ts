//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { graphDecimalTransformer } from '@vulcanize/util';
import { GraphDecimal } from '@cerc-io/util';

@Entity()
@Index(['id', 'blockHash'])
export class LatestPool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal

  @Column('varchar', { length: 42 })
  token0!: string;

  @Column('varchar', { length: 42 })
  token1!: string;
}
