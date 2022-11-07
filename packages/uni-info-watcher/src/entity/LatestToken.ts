//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

@Entity()
export class LatestToken {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  latestBlockHash!: string

  @Column('integer')
  latestBlockNumber!: number;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;
}
