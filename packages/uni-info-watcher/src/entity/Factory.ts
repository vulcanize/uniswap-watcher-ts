import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('bigint', { default: BigInt(0) })
  poolCount!: bigint;

  @Column('numeric', { default: 0 })
  totalValueLockedETH!: number;

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0 })
  totalValueLockedUSD!: number;

  // TODO: Add remaining fields when they are used.
}
