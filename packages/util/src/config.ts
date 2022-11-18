//
// Copyright 2021 Vulcanize, Inc.
//

import { Config as BaseConfig, UpstreamConfig as BaseUpstreamConfig } from '@cerc-io/util';

export interface UpstreamConfig extends BaseUpstreamConfig {
  uniWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  };
  tokenWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  }
}

export interface Config extends BaseConfig {
  upstream: UpstreamConfig;
}
