import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber'])
export class Bundle {
  @PrimaryColumn('varchar', { length: 1 })
  id!: string;

  @PrimaryColumn('numeric')
  blockNumber!: number;

  @Column('numeric')
  ethPriceUSD!: number
}
