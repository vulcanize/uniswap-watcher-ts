import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';

import { Config as CacheConfig } from '@vulcanize/cache';

const log = debug('vulcanize:config');

export interface Config {
  server: {
    host: string;
    port: number;
  };
  database: ConnectionOptions;
  upstream: {
    cache: CacheConfig,
    ethServer: {
      gqlApiEndpoint: string;
      gqlPostgraphileEndpoint: string;
    }
    traceProviderEndpoint: string;
    uniWatcher: {
      gqlEndpoint: string;
      gqlSubscriptionEndpoint: string;
    };
    tokenWatcher: {
      gqlEndpoint: string;
      gqlSubscriptionEndpoint: string;
    }
  },
  jobQueue: {
    dbConnectionString: string;
    maxCompletionLag: number;
  }
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  return config;
};
