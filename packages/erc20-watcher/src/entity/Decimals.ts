//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'token'], { unique: true })
export class Decimals {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  token!: string;

  @Column('integer')
  value!: number;

  @Column('text', { nullable: true })
  proof!: string;
}
