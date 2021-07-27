import { Contract, utils } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';

import { abi } from '../artifacts/ERC20.json';
import ERC20SymbolBytesABI from '../artifacts/ERC20SymbolBytes.json';
import ERC20NameBytesABI from '../artifacts/ERC20NameBytes.json';
import { StaticTokenDefinition } from './staticTokenDefinition';

export const fetchTokenSymbol = async (ethProvider: BaseProvider, tokenAddress: string): Promise<string> => {
  const contract = new Contract(tokenAddress, abi, ethProvider);
  const contractSymbolBytes = new Contract(tokenAddress, ERC20SymbolBytesABI, ethProvider);
  let symbolValue = 'unknown';

  // Try types string and bytes32 for symbol.
  try {
    const result = await contract.symbol();
    symbolValue = result;
  } catch (error) {
    try {
      const result = await contractSymbolBytes.symbol();

      // For broken pairs that have no symbol function exposed.
      if (!isNullEthValue(result)) {
        symbolValue = utils.parseBytes32String(result);
      } else {
        // Try with the static definition.
        const staticTokenDefinition = StaticTokenDefinition.fromAddress(tokenAddress);

        if (staticTokenDefinition !== null) {
          symbolValue = staticTokenDefinition.symbol;
        }
      }
    } catch (error) {
      // symbolValue is unknown if the calls revert.
    }
  }

  return symbolValue;
};

export const fetchTokenName = async (ethProvider: BaseProvider, tokenAddress: string): Promise<string> => {
  const contract = new Contract(tokenAddress, abi, ethProvider);
  const contractNameBytes = new Contract(tokenAddress, ERC20NameBytesABI, ethProvider);
  let nameValue = 'unknown';

  // Try types string and bytes32 for name.
  try {
    const result = await contract.name();
    nameValue = result;
  } catch (error) {
    try {
      const result = await contractNameBytes.name();

      // For broken pairs that have no name function exposed.
      if (!isNullEthValue(result)) {
        nameValue = utils.parseBytes32String(result);
      } else {
        // Try with the static definition.
        const staticTokenDefinition = StaticTokenDefinition.fromAddress(tokenAddress);

        if (staticTokenDefinition !== null) {
          nameValue = staticTokenDefinition.name;
        }
      }
    } catch (error) {
      // nameValue is unknown if the calls revert.
    }
  }

  return nameValue;
};

export const fetchTokenTotalSupply = async (ethProvider: BaseProvider, tokenAddress: string): Promise<bigint> => {
  const contract = new Contract(tokenAddress, abi, ethProvider);
  let totalSupplyValue = null;

  try {
    const result = await contract.totalSupply();
    totalSupplyValue = result.toString();
  } catch (error) {
    totalSupplyValue = 0;
  }

  return BigInt(totalSupplyValue);
};

export const fetchTokenDecimals = async (ethProvider: BaseProvider, tokenAddress: string): Promise<bigint> => {
  const contract = new Contract(tokenAddress, abi, ethProvider);

  // Try types uint8 for decimals.
  let decimalValue = null;

  try {
    const result = await contract.decimals();
    decimalValue = result.toString();
  } catch (error) {
    // Try with the static definition.
    const staticTokenDefinition = StaticTokenDefinition.fromAddress(tokenAddress);

    if (staticTokenDefinition != null) {
      return staticTokenDefinition.decimals;
    }
  }

  return BigInt(decimalValue);
};

const isNullEthValue = (value: string): boolean => {
  return value === '0x0000000000000000000000000000000000000000000000000000000000000001';
};
