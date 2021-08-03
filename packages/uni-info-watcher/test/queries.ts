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
