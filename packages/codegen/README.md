# Code Generator

## Run

* Run the following command to generate a flattened contract file from a contract file:

  ```bash
  yarn codegen:flatten <input-file-path> <output-file-path>
  ```

    * `input-file-path`: Input contract file path (required).
    * `output-file-path`: Flattened contract output file path (required).

  Example:
  
  ```bash
  yarn codegen:flatten test/examples/contracts/ERC20.sol test/examples/contracts/ERC20-flat.sol
  ```

* Run the following command to generate schema from a contract file:

  ```bash
  yarn codegen:gql --input-file <input-file-path> --output-file [output-file-path] --mode [eth_call | storage]
  ```

    * `input-file`: Input contract (must be a flattened contract) file path or an url (required).
    * `output-file`: Schema output file path (logs output using `stdout` if not provided).
    * `mode`: Contract variables access mode (default: `storage`).

  Examples:
  
  ```bash
  yarn codegen:gql --input-file test/examples/contracts/ERC20-flat.sol --output-file ERC20-schema.gql --mode eth_call
  ```

  ```bash
  yarn codegen:gql --input-file https://git.io/Jupci --output-file ERC721-schema.gql --mode storage
  ```

## Demo

* Flatten a contract file:

  ```bash
  yarn codegen:flatten /home/prathamesh/watcher-ts/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol test/examples/contracts/ERC20-flat.sol
  ```

* Generate schema from the flattened contract file:
  
  ```bash
  yarn codegen:gql --input-file test/examples/contracts/ERC20-flat.sol --output-file ERC20-schema.gql --mode storage
  ```
