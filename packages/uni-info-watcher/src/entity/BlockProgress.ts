//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

import { BlockProgressInterface } from '@cerc-io/util';

@Entity()
@Index(['blockHash'], { unique: true })
@Index(['blockNumber'])
@Index(['parentHash'])
@Index(['blockHash', 'isPruned'])
@Index(['blockTimestamp'])
export class BlockProgress implements BlockProgressInterface {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  cid!: string;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('varchar', { length: 66, nullable: true })
  parentHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  blockTimestamp!: number;

  @Column('integer')
  numEvents!: number;

  @Column('integer', { default: 0 })
  numProcessedEvents!: number;

  @Column('integer', { default: -1 })
  lastProcessedEventIndex!: number;

  @Column('boolean')
  isComplete!: boolean

  @Column('boolean', { default: false })
  isPruned!: boolean

  @CreateDateColumn()
  createdAt!: Date;
}
