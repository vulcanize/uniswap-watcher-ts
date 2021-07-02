# Uniswap

## Scripts

* **generate:schema**

  Generate schema for uniswap subgraph in graphql format. The `get-graphql-schema` tool is used to generate the schema (https://github.com/prisma-labs/get-graphql-schema). The uniswap subgraph graphql endpoint is provided in the script to generate the schema.

* **lint:schema**

  Lint schema graphql files.
  ```bash
  $ yarn lint:schema schema/frontend.graphql
  ```

* **deploy**

  Deploy Factory contract, ERC20 tokens and create a Pool.
  ```bash
  $ yarn deploy

  # Deploy to private network specified by ETH_RPC_URL in .env
  # $ cp .env.example .env
  $ yarn deploy --network private
  ```

## References

* https://github.com/Uniswap/uniswap-v3-core
