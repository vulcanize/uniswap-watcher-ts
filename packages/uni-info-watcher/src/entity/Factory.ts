import { Entity, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber', 'id'], { unique: true })
export class Factory {
  @Column('varchar', { length: 42 })
  id!: string;

  @Column('numeric')
  blockNumber!: number;

  @Column('numeric', { default: 0 })
  poolCount!: number;
}
