//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['address'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 42 })
  address!: string;

  @Column('integer')
  startingBlock!: number;
}
