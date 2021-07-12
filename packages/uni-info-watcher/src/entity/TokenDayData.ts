import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

import { Token } from './Token';

@Entity()
export class TokenDayData {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @ManyToOne(() => Token)
  token!: Token

  @Column('numeric', { transformer: decimalTransformer })
  high!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  low!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  open!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  close!: Decimal;

  @Column('numeric', { transformer: decimalTransformer })
  priceUSD!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  totalValueLocked!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  totalValueLockedUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  volumeUSD!: Decimal
}
