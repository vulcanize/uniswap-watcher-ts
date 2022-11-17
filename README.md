# uniswap-watcher-ts

## Setup

This project uses [yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/).

- Install packages (Node.JS v16.15.1):

  ```bash
  yarn
  ```

- Link [@cerc-io/watcher-ts](https://github.com/cerc-io/watcher-ts) packages:

  - In `@cerc-io/watcher-ts` repo, build and link the packages to use from uniswap-watcher-ts

    ```bash
    # Build packages
    yarn && yarn build

    # Link packages
    cd packages/util && yarn link && cd ../..
    cd packages/ipld-eth-client && yarn link && cd ../..
    cd packages/solidity-mapper && yarn link && cd ../..
    cd packages/graph-node && yarn link && cd ../..
    cd packages/cache && yarn link && cd ../..
    # Workaround for typeorm dependency issue when using yarn link
    cd node_modules/typeorm && yarn link && cd ../..
    ```

  - In `uniswap-watcher-ts`:

    ```bash
    yarn link "@cerc-io/util"
    yarn link "@cerc-io/ipld-eth-client"
    yarn link "@cerc-io/solidity-mapper"
    yarn link "@cerc-io/graph-node"
    yarn link "@cerc-io/cache"
    yarn link "typeorm"
    ```

- Build packages:

  ```bash
  yarn build

  # For running tests
  yarn build:contracts
  ```

### Services

The default config files used by the watchers assume the following services are setup and running on localhost:

* `vulcanize/go-ethereum` on port 8545
* `vulcanize/ipld-eth-server` with native GQL API enabled on port 8082 and RPC API on port 8081

To check whether the endpoints in watcher config are working, run:

```bash
cd packages/util

yarn check-config --config-file ../erc20-watcher/environments/local.toml

# Check config file in other watcher.
yarn check-config --config-file ../uni-watcher/environments/local.toml
# vulcanize:check-config Checking ipld-eth-server GQL endpoint http://127.0.0.1:8082/graphql +0ms
# vulcanize:check-config ipld-eth-server GQL endpoint working +33ms
# vulcanize:check-config Checking RPC endpoint http://127.0.0.1:8081 +1ms
# vulcanize:check-config RPC endpoint working +25ms
```

#### Note

* In `vulcanize/ipld-eth-server`, add the following statement to `[ethereum]` section in `environments/config.toml`:

  `chainConfig = "./chain.json" # ETH_CHAIN_CONFIG`

### Databases

Note: Requires `postgres12`.

Login as the postgres user:

```bash
sudo su - postgres
```

Create the databases for the watchers:

```
createdb erc20-watcher
createdb uni-watcher
createdb uni-info-watcher
```

Create the databases for the job queues and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

```
createdb erc20-watcher-job-queue
createdb uni-watcher-job-queue
createdb uni-info-watcher-job-queue
```

```
postgres@tesla:~$ psql -U postgres -h localhost erc20-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

erc20-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
erc20-watcher-job-queue=# exit
```

```
postgres@tesla:~$ psql -U postgres -h localhost uni-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

uni-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
uni-watcher-job-queue=# exit
```

```
postgres@tesla:~$ psql -U postgres -h localhost uni-info-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

uni-info-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
uni-info-watcher-job-queue=# exit
```

#### Reset

Reset the databases used by the watchers:

```bash
yarn db:reset
```

## Run

Build the files in packages:

```bash
yarn build

# To watch for changes and build (used in development).
yarn build:watch
```

To run any watcher, `cd` into their package folder and run:

```bash
yarn server
```

If the watcher uses a job queue, start the job runner in another terminal:

```bash
yarn job-runner
```
