//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

import { BlockProgressInterface } from '@vulcanize/util';

@Entity()
@Index(['blockHash'], { unique: true })
@Index(['blockNumber'])
@Index(['parentHash'])
export class BlockProgress implements BlockProgressInterface {
  @PrimaryGeneratedColumn()
  id!: number;

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

  @Column('integer')
  numProcessedEvents!: number;

  @Column('integer')
  lastProcessedEventIndex!: number;

  @Column('boolean')
  isComplete!: boolean

  @Column('boolean', { default: false })
  isPruned!: boolean
}
