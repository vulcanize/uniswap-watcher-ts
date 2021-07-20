import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'contract'], { unique: true })
export class BlockProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  contract!: string;

  @Column('integer')
  numEvents!: number;

  @Column('integer')
  numProcessedEvents!: number;

  @Column('boolean')
  isComplete!: boolean
}
