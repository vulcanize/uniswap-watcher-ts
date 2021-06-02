import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity()
// There MUST be a unique entry for a particular (block, token, receipt idx, log idx) tuple.
@Index(["blockHash", "receiptIndex", "logIndex"], { unique: true })
// Index to query 'Transfer' events efficiently.
@Index(["blockHash", "token", "eventName", "transferFrom", "transferTo"])
// Index to query 'Approval' events efficiently.
@Index(["blockHash", "token", "eventName", "approvalOwner", "approvalSpender"])
export class Event {

  @PrimaryGeneratedColumn()
  id: number;

  @Column("varchar", { length: 66 })
  blockHash: string;

  @Column("numeric")
  // The index of the receipt inside the block, that this log/event is contained in.
  receiptIndex: number;

  // The index of the log/event inside the receipt, since a receipt can have multiple logs.
  @Column("numeric")
  logIndex: number;

  @Column("varchar", { length: 42 })
  token: string;

  @Column("varchar", { length: 256 })
  eventName: string;

  @Column("text")
  proof: string;

  // Transfer event columns.
  @Column("varchar", { length: 42, nullable: true })
  transferFrom: string;

  @Column("varchar", { length: 42, nullable: true })
  transferTo: string;

  @Column("numeric", { nullable: true })
  transferValue: number;

  // Approval event columns.
  @Column("varchar", { length: 42, nullable: true })
  approvalOwner: string;

  @Column("varchar", { length: 42, nullable: true })
  approvalSpender: string;

  @Column("numeric", { nullable: true })
  approvalValue: number;
}
