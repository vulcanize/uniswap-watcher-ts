# ERC721 Watcher

## Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

* Run the IPFS (go-ipfs version 0.9.0) daemon:

  ```bash
  ipfs daemon
  ```

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres
  createdb erc721-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on it (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```
  createdb erc721-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost erc721-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  erc721-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  erc721-watcher-job-queue=# exit
  ```

* Update the [config](./environments/local.toml) with database connection settings.

* Update the `upstream` config in the [config file](./environments/local.toml) and provide the `ipld-eth-server` GQL API and the `indexer-db` postgraphile endpoints.

* Update the `server` config in the [config file](./environments/local.toml) with state checkpoint settings and provide the IPFS API address.

## Run

* Run the watcher:

  ```bash
  yarn server
  ```

* GQL console: http://localhost:3009/graphql

* Run the job-runner:

  ```bash
  yarn job-runner
  ```

* To watch a contract:

  ```bash
  yarn watch:contract --address <contract-address> --kind <contract-kind> --checkpoint <true | false> --starting-block [block-number]
  ```

  * `address`: Address or identifier of the contract to be watched.
  * `kind`: Kind of the contract.
  * `checkpoint`: Turn checkpointing on (`true` | `false`).
  * `starting-block`: Starting block for the contract (default: latest indexed block).

  Example:

  Watch a contract with its address and checkpointing on:

  ```bash
  yarn watch:contract --address 0x1F78641644feB8b64642e833cE4AFE93DD6e7833 --kind ERC721 --checkpoint true --starting-block 12345
  ```

* To fill a block range:

  ```bash
  yarn fill --start-block <from-block> --end-block <to-block>
  ```

  * `start-block`: Block number to start filling from.
  * `end-block`: Block number till which to fill. 

* To create a checkpoint for a contract:

  ```bash
  yarn checkpoint --address <contract-address> --block-hash [block-hash]
  ```

  * `address`: Address or identifier of the contract for which to create a checkpoint.
  * `block-hash`: Hash of a block (in the pruned region) at which to create the checkpoint (default: latest canonical block hash).

* To reset the watcher to a previous block number:

  * Reset state:

    ```bash
    yarn reset state --block-number <previous-block-number>
    ```

  * Reset job-queue:

    ```bash
    yarn reset job-queue --block-number <previous-block-number>
    ```

  * `block-number`: Block number to which to reset the watcher.

* To export and import the watcher state:

  * In source watcher, export watcher state:

    ```bash
    yarn export-state --export-file [export-file-path]
    ```

    * `export-file`: Path of JSON file to which to export the watcher data.

  * In target watcher, run job-runner:

    ```bash
    yarn job-runner
    ```

  * Import watcher state:

    ```bash
    yarn import-state --import-file <import-file-path>
    ```

    * `import-file`: Path of JSON file from which to import the watcher data.

  * Run fill:

    ```bash
    yarn fill --start-block <snapshot-block> --end-block <to-block>
    ```

    * `snapshot-block`: Block number at which the watcher state was exported.

  * Run server:

    ```bash
    yarn server
    ```

* To inspect a CID:

  ```bash
  yarn inspect-cid --cid <cid>
  ```

  * `cid`: CID to be inspected.

* To reset the databases:

  ```bash
  yarn db:reset
  ```