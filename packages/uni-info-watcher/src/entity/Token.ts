import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber', 'id'])
export class Token {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @Column('numeric')
  blockNumber!: number;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;

  @Column('numeric')
  decimals!: bigint;

  @Column('numeric')
  totalSupply!: bigint;
}
