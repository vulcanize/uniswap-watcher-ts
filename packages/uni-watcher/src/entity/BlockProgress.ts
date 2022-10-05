//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

import { BlockProgressInterface } from '@vulcanize/util';

@Entity()
@Index(['blockHash'], { unique: true })
@Index(['blockNumber'])
@Index(['parentHash'])
export class BlockProgress implements BlockProgressInterface {
  @PrimaryGeneratedColumn()
  id!: number;

  // TODO: Remove nullable after cid for all blocks updated.
  @Column('varchar', { nullable: true })
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
