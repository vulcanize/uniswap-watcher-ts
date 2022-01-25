//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne, Index } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

import { Token } from './Token';

@Entity()
@Index(['id', 'blockNumber'])
export class TokenHourData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  periodStartUnix!: number

  @Column('varchar', { length: 42, nullable: true })
  tokenId!: string;

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token!: Token

  @Column('numeric', { transformer: graphDecimalTransformer })
  high!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  low!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  open!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  close!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  priceUSD!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  totalValueLocked!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volume!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  untrackedVolumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal
}
