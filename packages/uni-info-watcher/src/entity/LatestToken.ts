//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockHash'])
export class LatestToken {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @Column('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;
}
