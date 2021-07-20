import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export const UNKNOWN_EVENT_NAME = '__unknown__';

@Entity()
// Index to query all events for a contract efficiently.
@Index(['blockHash', 'contract'])
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('varchar', { length: 66 })
  txHash!: string;

  // Index of the log in the block.
  @Column('integer')
  index!: number;

  @Column('varchar', { length: 42 })
  contract!: string;

  @Column('varchar', { length: 256 })
  eventName!: string;

  @Column('text')
  eventInfo!: string;

  @Column('text')
  extraInfo!: string;

  @Column('text')
  proof!: string;
}
