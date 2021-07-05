import { gql } from 'apollo-server-express';
import { Client } from './client';

interface Config {
  gqlEndpoint: string;
  gqlSubscriptionEndpoint: string;
}

export class UniClient {
  _config: Config;
  _client: Client;

  constructor (config: Config) {
    this._config = config;

    this._client = new Client(config);
  }

  async watchPoolCreatedEvent (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._client.subscribe(
      gql`
        subscription SubscriptionReceipt {
          onEvent {
            blockHash
            contract
            event {
              proof {
                data
              }
              event {
                __typename
                ... on PoolCreatedEvent {
                  token0
                  token1
                  fee
                  tickSpacing
                  pool
                }
              }
            }
          }
        }
      `,
      ({ data }) => {
        onNext(data.onEvent);
      }
    );
  }
}
