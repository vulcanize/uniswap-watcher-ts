import { Contract, utils } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';

import { abi } from '../artifacts/ERC20.json';
import ERC20SymbolBytesABI from '../artifacts/ERC20SymbolBytes.json';
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

const isNullEthValue = (value: string): boolean => {
  return value === '0x0000000000000000000000000000000000000000000000000000000000000001';
};
