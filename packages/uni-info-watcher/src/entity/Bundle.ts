import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';

import { decimalTransformer } from '../utils/database';

@Entity()
export class Bundle {
  @PrimaryColumn('varchar', { length: 1 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  ethPriceUSD!: Decimal
}
