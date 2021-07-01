import { gql } from 'graphql-request';

export const queryBundle = gql`
query getBundle($id: String!, $block: Number!) {
  bundle(id: $id, block: { number: $block }) {
    id
    ethPriceUSD
  }
}
`;
