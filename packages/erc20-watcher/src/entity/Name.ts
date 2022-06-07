//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'token'], { unique: true })
export class Name {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  token!: string;

  @Column('varchar')
  value!: string;

  @Column('text', { nullable: true })
  proof!: string;
}
