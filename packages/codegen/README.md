# Code Generator

## Run

* Run the following command to generate schema from a contract file:
  * `input-file`: Input contract file path (required).
  * `output-file`: Schema output file path (default: `console`).
  * `mode`: Contract variables access mode (default: `eth-call`).  

```bash
yarn codegen:gql --input-file [input-file-path] --output-file [output-file-path] --mode [eth-call | storage]
```
