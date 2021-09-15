# Code Generator

## Run

* Run the following command to generate schema from a contract file:

  ```bash
  yarn codegen:gql --input-file <input-file-path> --output-file [output-file-path] --mode [eth_call | storage]
  ```

    * `input-file`: Input contract file (must be a flattened contract file) path (required).
    * `output-file`: Schema output file path (logs output using `stdout` if not provided).
    * `mode`: Contract variables access mode (default: `storage`).

  Example: 
  
  ```bash
  yarn codegen:gql --input-file test/examples/contracts/ERC20-flat.sol --output-file schema.gql --mode eth_call
  ```
