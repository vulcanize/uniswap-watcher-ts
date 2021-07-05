import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber', 'id'])
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @Column('numeric')
  blockNumber!: number;
}
