import { gql } from 'apollo-server-express';
import { Client } from './client';

interface Config {
  gqlEndpoint: string;
  gqlSubscriptionEndpoint: string;
}

export class TokenClient {
  _config: Config;
  _client: Client;

  constructor (config: Config) {
    this._config = config;

    this._client = new Client(config);
  }

  async getSymbol (blockHash: string | undefined, token: string): Promise<any> {
    console.log('getting symbol', blockHash, token);
    const { symbol } = await this._client.query(
      gql`
        query getSymbol($blockHash: String!, $token: Address!) {
          symbol(blockHash: $blockHash, token: $token) {
            value
            proof {
              data
            }
          }
        }
      `,
      { blockHash, token }
    );

    console.log('queried', symbol);
    return symbol;
  }
}
