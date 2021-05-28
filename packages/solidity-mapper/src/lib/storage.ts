import { utils, BigNumber } from 'ethers';

export interface StorageLayout {
  storage: [{
    slot: string;
    offset: number;
    type: string;
    label: string;
  }];
  types: {
    [type: string]: {
      encoding: string;
      numberOfBytes: string;
      label: string;
    }
  };
}

export type GetStorageAt = (address: string, position: string) => Promise<string>

/**
 * Function to get the value from storage for a contract variable.
 * @param variableName
 * @param address
 * @param storageLayout
 * @param getStorageAt
 */
export const getStorageValue = async (variableName: string, address: string, storageLayout: StorageLayout, getStorageAt: GetStorageAt) => {
  const { storage, types } = storageLayout;
  const targetState = storage.find((state) => state.label === variableName)

  if (targetState) {
    const { slot, offset, type } = targetState;
    const { encoding, numberOfBytes, label } = types[type]

    switch (encoding) {
      case 'inplace': {
        const valueArray = await getInplaceArray(address, slot, offset, numberOfBytes, getStorageAt);

        if (['address', 'address payable'].some(type => type === label)) {
          return utils.hexlify(valueArray);
        }

        if (label === 'bool') {
          return !BigNumber.from(valueArray).isZero();
        }

        return BigNumber.from(valueArray).toNumber();
      }

      case 'bytes': {
        const valueArray = await getBytesArray(address, slot, getStorageAt);
        return utils.toUtf8String(valueArray)
      }

      default:
        break;
    }
  }
}

/**
 * Function to get array value for inplace encoding.
 * @param address
 * @param slot
 * @param offset
 * @param numberOfBytes
 * @param getStorageAt
 */
const getInplaceArray = async (address: string, slot: string, offset: number, numberOfBytes: string, getStorageAt: GetStorageAt) => {
  const value = await getStorageAt(address, BigNumber.from(slot).toHexString());
  const uintArray = utils.arrayify(value);
  const start = uintArray.length - (offset + Number(numberOfBytes));
  const end = uintArray.length - offset;
  const offsetArray = uintArray.slice(start, end)
  return offsetArray;
}

/**
 * Function to get array value for bytes encoding.
 * @param address
 * @param slot
 * @param getStorageAt
 */
const getBytesArray = async (address: string, slot: string, getStorageAt: GetStorageAt) => {
  let value = await getStorageAt(address, BigNumber.from(slot).toHexString());
  const uintArray = utils.arrayify(value);
  let length = 0;

  if (BigNumber.from(uintArray[0]).isZero()) {
    const slotValue = BigNumber.from(value);
    length = slotValue.sub(1).div(2).toNumber();
  } else {
    length = BigNumber.from(uintArray[uintArray.length - 1]).div(2).toNumber();
  }

  if (length < 32) {
    return uintArray.slice(0, length);
  }

  const values = [];

  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const slotHex = utils.hexZeroPad(BigNumber.from(slot).toHexString(), 32);
  const position = utils.keccak256(slotHex);

  for(let i = 0; i < length / 32; i++) {
    const value = await getStorageAt(address, BigNumber.from(position).add(i).toHexString());
    values.push(value);
  }

  return utils.concat(values).slice(0, length);
}
