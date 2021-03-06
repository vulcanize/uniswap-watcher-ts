# solidity-mapper

Get value of state variable from storage for a solidity contract.

## Pre-requisites

* NodeJS and NPM

  https://nodejs.org/en/ or use https://github.com/nvm-sh/nvm

## Instructions

* Create environment variable file
  ```bash
  $ cp .env.example .env
  ```

* Run the tests using the following command
  ```bash
  $ yarn test

  # For testing on private network using RPC getStorageAt.
  # Set ETH_RPC_URL in .env
  $ yarn test:geth-rpc

  # For testing on private network using ipld-eth-client getStorageAt.
  # Set GQL_ENDPOINT in .env
  $ yarn test:ipld-gql
  ```

## Different Types

* [ ] Value Types
  * [x] Booleans
  * [x] Integers
  * [ ] Fixed Point Numbers
  * [x] Address
  * [x] Contract Types
  * [x] Fixed-size byte arrays
  * [x] Enums
  * [ ] Function Types
* [ ] Reference Types
  * [x] Arrays
    * [x] Get all elements in array
    * [x] Get element in array by index
    * [x] Fixed size arrays
      * [x] Integer Type
      * [x] Boolean Type
      * [x] Address Type
      * [x] Fixed-size byte arrays
      * [x] Enum type
      * [x] Dynamically-sized byte array
      * [x] Struct Type
      * [x] Mapping Type
    * [x] Dynamically-sized arrays
      * [x] Integer Type
      * [x] Boolean Type
      * [x] Address Type
      * [x] Fixed-size byte arrays
      * [x] Enum Type
      * [x] Dynamically-sized byte array
      * [x] Struct Type
      * [x] Mapping Type
    * [x] Nested Arrays
      * [x] Fixed size arrays
      * [x] Dynamically-sized arrays
  * [x] Dynamically-sized byte array
    * [x] Bytes
    * [x] String
  * [x] Structs
    * [x] Get struct value with all members
    * [x] Value Types
    * [x] Get value of a single member in struct
    * [x] Reference Types
      * [x] Struct type members (nested)
      * [x] Fixed size Array members
      * [x] Dynamically sized Array members
      * [x] Bytes and string type members
      * [x] Mapping type members
  * [ ] Mapping Types
    * [x] Value Type keys
    * [ ] Fixed-size byte array keys
    * [x] Dynamically-sized byte array keys
    * [x] Reference Type Mapping values
      * [x] Struct type values
      * [x] Array type values
      * [x] Dynamically sized Bytes and string type values
    * [x] Nested Mapping

## Observations

* The storage layouts are formed according to the rules in https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#layout-of-state-variables-in-storage

* Structs can occupy multiple slots depending on the size required by its members.

* Fixed arrays can occupy multiple slots according to the size of the array and the type of array.
