# Code Generator

## Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

## Run

* Run the following command to generate a watcher from a contract file:

  ```bash
  yarn codegen -i <input-file-path> -c <contract-name> -o [output-folder] -m [eth_call | storage] -f [true | false]
  ```

    * `input-file`(alias: `i`): Input contract file path or an URL (required).
    * `contract-name`(alias: `c`): Main contract name (required).
    * `output-folder`(alias: `o`): Output folder path. (logs output using `stdout` if not provided).
    * `mode`(alias: `m`): Code generation mode (default: `storage`).
    * `flatten`(alias: `f`): Flatten the input contract file (default: `true`).

  **Note**: When passed an *URL* as `input-file`, it is assumed that it points to an already flattened contract file.

  Examples:
  
  ```bash
  yarn codegen -i ./test/examples/contracts/ERC20.sol -c ERC20 -o ../ERC20-watcher -m eth_call
  ```

  ```bash
  yarn codegen -i https://git.io/Jupci -c ERC721 -o ../ERC721-watcher -m storage
  ```

## Demo

* Install required packages:

  ```bash
  yarn
  ```

* Generate a watcher from a contract file:
  
  ```bash
  yarn codegen -i ../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol -c ERC20 -o ../new-watcher -m eth_call
  ```

* Generate a watcher from a flattened contract file from an URL:
  
  ```bash
  yarn codegen -i https://git.io/Jupci -c ERC721 -o ../new-watcher -m storage
  ```

## References

* [ERC20 schema generation (eth_call mode).](https://git.io/JuhN2)
* [ERC20 schema generation (storage mode).](https://git.io/JuhNr)
* [ERC721 schema generation (eth_call mode).](https://git.io/JuhNK)
* [ERC721 schema generation (storage mode).](https://git.io/JuhN1)

## Known Issues

* Currently, `node-fetch v2.6.2` is being used to fetch from URLs as `v3.0.0` is an [ESM-only module](https://www.npmjs.com/package/node-fetch#loading-and-configuring-the-module) and `ts-node` transpiles to import  it using `require`. 
