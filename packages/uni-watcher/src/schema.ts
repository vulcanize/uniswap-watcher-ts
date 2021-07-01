import { gql } from '@apollo/client/core';

export default gql`
# Types

# Support uint256 values.
scalar BigInt

# Proof for returned data. Serialized blob for now.
# Will be converted into a well defined structure later.
type Proof {
  data: String!
}

# Result type, with proof, for string method return values.
type ResultString {
  value: String

  # Proof from state/storage trie.
  proof: Proof
}

# Result type, with proof, for uint256 method return values.
type ResultUInt256 {
  value: BigInt!

  # Proof from state/storage trie.
  proof: Proof
}

# Transfer Event
type TransferEvent {
  from: String!
  to: String!
  value: BigInt!
}

# Approval Event
type ApprovalEvent {
  owner: String!
  spender: String!
  value: BigInt!
}

# All possible event types fired by an ERC20 contract.
union TokenEvent = TransferEvent | ApprovalEvent

# Result type, with proof, for event return values.
type ResultEvent {
  event: TokenEvent!

  # Proof from receipts trie.
  proof: Proof
}

# Watched event, include additional context over and above the event data.
type WatchedEvent {
  blockHash: String!
  token: String!

  event: ResultEvent!
}

#
# Queries
#

type Query {

  # Get token events at a certain block, optionally filter by event name.
  events(
    blockHash: String!
    token: String!
    name: String
  ): [ResultEvent!]
}

#
# Subscriptions
#
type Subscription {

  # Watch for token events (at head of chain).
  onTokenEvent: WatchedEvent!
}
`;
