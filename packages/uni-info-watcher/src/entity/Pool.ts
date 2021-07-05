import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
// Index to query all events for a contract efficiently.
@Index(['blockNumber', 'id'])
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @Column('numeric')
  blockNumber!: number;
}
