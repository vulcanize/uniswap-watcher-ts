import "@nomiclabs/hardhat-ethers";
import { CompilerOutput, CompilerOutputBytecode, HardhatRuntimeEnvironment } from "hardhat/types";

interface State {
  slot: string;
  offset: number;
  type: string;
  label: string;
}

interface StorageCompilerOutput extends CompilerOutput {
  contracts: {
    [sourceName: string]: {
      [contractName: string]: {
        abi: any;
        evm: {
          bytecode: CompilerOutputBytecode;
          deployedBytecode: CompilerOutputBytecode;
          methodIdentifiers: {
            [methodSignature: string]: string;
          };
        };
        storageLayout?: {
          storage: State[];
          types: {
            [type: string]: {
              encoding: string;
              numberOfBytes: string;
              label: string;
            }
          }
        }
      };
    };
  };
}

/**
 * Function to get the value from storage for a contract variable.
 * @param hre
 * @param contractName
 * @param variableName
 * @param address
 */
export const getStorageValue = async (hre: HardhatRuntimeEnvironment, contractName: string, variableName: string, address: string) => {
  const { artifacts, ethers } = hre;

  const artifact = await artifacts.readArtifact(contractName);
  const buildInfo = await artifacts.getBuildInfo(`${artifact.sourceName}:${artifact.contractName}`)

  if (buildInfo) {
    const output: StorageCompilerOutput = buildInfo.output

    const { storageLayout } = output.contracts[artifact.sourceName][artifact.contractName];

    if (storageLayout) {
      const { storage, types } = storageLayout;
      const targetState = storage.find((state: State) => state.label === variableName)

      if (targetState) {
        const { slot, offset, type } = targetState;
        const { encoding, numberOfBytes, label } = types[type]

        switch (encoding) {
          case 'inplace': {
            const valueArray = await getInplaceArray(ethers, address, slot, offset, numberOfBytes);

            if (['address', 'address payable'].some(type => type === label)) {
              return ethers.utils.hexlify(valueArray);
            }

            if (label === 'bool') {
              return !ethers.BigNumber.from(valueArray).isZero();
            }

            return ethers.BigNumber.from(valueArray).toNumber();
          }

          case 'bytes': {
            const valueArray = await getBytesArray(ethers, address, slot);
            return ethers.utils.toUtf8String(valueArray)
          }

          default:
            break;
        }
      }
    }
  }
}

/**
 * Function to get array value for inplace encoding.
 * @param ethers
 * @param address
 * @param slot
 * @param offset
 * @param numberOfBytes
 */
const getInplaceArray = async (ethers: any, address: string, slot: string, offset: number, numberOfBytes: string) => {
  const value = await ethers.provider.getStorageAt(address, ethers.BigNumber.from(slot));
  const uintArray = ethers.utils.arrayify(value);
  const start = uintArray.length - (offset + Number(numberOfBytes));
  const end = uintArray.length - offset;
  const offsetArray = uintArray.slice(start, end)
  return offsetArray;
}

/**
 * Function to get array value for bytes encoding.
 * @param ethers
 * @param address
 * @param slot
 */
const getBytesArray = async (ethers: any, address: string, slot: string) => {
  let value = await ethers.provider.getStorageAt(address, ethers.BigNumber.from(slot));
  const uintArray = ethers.utils.arrayify(value);
  let length = 0;

  if (ethers.BigNumber.from(uintArray[0]).isZero()) {
    const slotValue = ethers.BigNumber.from(value);
    length = slotValue.sub(1).div(2).toNumber();
  } else {
    length = ethers.BigNumber.from(uintArray[uintArray.length - 1]).div(2).toNumber();
  }

  if (length < 32) {
    return uintArray.slice(0, length);
  }

  const values = [];

  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const slotHex = ethers.utils.hexZeroPad(ethers.BigNumber.from(slot).toHexString(), 32);
  const position = ethers.utils.keccak256(slotHex);

  for(let i = 0; i < length / 32; i++) {
    const value = await ethers.provider.getStorageAt(address, ethers.BigNumber.from(position).add(i));
    values.push(value);
  }

  return ethers.utils.concat(values).slice(0, length);
}
