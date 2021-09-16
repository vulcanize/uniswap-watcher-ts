# Code Generator

## Run

* Run the following command to generate a flattened contract file from a contract file:

  ```bash
  yarn codegen:flatten <input-file-path> [output-dir]
  ```

    * `input-file-path`: Input contract file path (absolute) (required). Note: Currently, relative path doesn't work.
    * `output-dir`: Directory to store the flattened contract output file (default: `./out`).

  Example:
  
  ```bash
  yarn codegen:flatten ~/watcher-ts/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol ./flattened
  ```

  This will generate file `ERC20_flat.sol` in `./flattened`.

* Run the following command to generate schema from a contract file:

  ```bash
  yarn codegen:gql --input-file <input-file-path> --output-file [output-file-path] --mode [eth_call | storage]
  ```

    * `input-file`: Input contract (must be a flattened contract) file path or an URL (required).
    * `output-file`: Schema output file path (logs output using `stdout` if not provided).
    * `mode`: Contract variables access mode (default: `storage`).

  Examples:
  
  ```bash
  yarn codegen:gql --input-file ./test/examples/contracts/ERC20-flat.sol --output-file ./ERC20-schema.gql --mode eth_call
  ```

  ```bash
  yarn codegen:gql --input-file https://git.io/Jupci --output-file ./ERC721-schema.gql --mode storage
  ```

## Demo

* Flatten a contract file:

  ```bash
  yarn codegen:flatten ~/watcher-ts/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol ./flattened
  ```

  Note: Currently, relative path for input-file-path doesn't work.

* Generate schema from the flattened contract file:
  
  ```bash
  yarn codegen:gql --input-file ./flattened/ERC20_flat.sol --output-file ./ERC20-schema.gql --mode storage
  ```

* Generate schema from the flattened contract file from an URL:
  
  ```bash
  yarn codegen:gql --input-file https://git.io/Jupci --output-file ./ERC721-schema.gql --mode eth_call
  ```
