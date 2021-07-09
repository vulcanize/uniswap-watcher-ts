import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Pool } from './Pool';

@Entity()
export class Token {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;

  @Column('numeric')
  totalSupply!: number;

  // TODO: Fetch decimals from contract using erc20-watcher. Currently using hardcoded value.
  @Column('bigint', { default: BigInt(18) })
  decimals!: bigint;

  @Column('numeric', { default: 0 })
  derivedETH!: number;

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0 })
  totalValueLocked!: number;

  @Column('numeric', { default: 0 })
  totalValueLockedUSD!: number;

  @ManyToMany(() => Pool)
  @JoinTable()
  whitelistPools!: Pool[];

  // TODO: Add remaining fields when they are used.
}
