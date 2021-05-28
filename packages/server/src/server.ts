import assert from 'assert';
import express, { Application, Request, Response } from 'express';
import { graphqlHTTP } from 'express-graphql';
import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers'

import { createSchema } from './gql';

export const createServer = async () => {
  const argv = yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string'
    })
    .argv

  const configFile = argv['configFile'];
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.exists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  var config = toml.parse(await fs.readFile(configFilePath));

  assert(config.server, 'Missing server config');

  const { host, port } = config.server;

  const app: Application = express();

  const schema = await createSchema(config);

  app.use(
    '/graphql',
    graphqlHTTP({
      schema,
      graphiql: true,
    }),
  );

  app.get('/', (req: Request, res: Response) => {
    res.send('ERC20 Watcher');
  });

  app.listen(port, host, () => {
    console.log(`Server is listening on host ${host} port ${port}`);
  });

  return app;
};

createServer().then(() => {
  console.log('Starting server...');
}).catch(err => {
  console.error(err);
});
