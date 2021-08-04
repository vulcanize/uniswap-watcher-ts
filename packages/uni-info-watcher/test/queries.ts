import { gql } from 'graphql-request';

export const queryToken = gql`
query queryToken($id: ID!) {
  token(id: $id) {
    id
  }
}`;

// Getting the first factory entity.
export const queryFactory = gql`
{
  factories(first: 1){id}
}`;

// Get pools filtered by tokens
export const queryPools = gql`
query queryPools($tokens: [String!]) {
  pools(where: { token0_in: $tokens, token1_in: $tokens }) {
    id,
    feeTier
  }
}`;
