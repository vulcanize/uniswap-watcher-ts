import { utils, BigNumber } from 'ethers';

interface Storage {
  slot: string;
  offset: number;
  type: string;
  label: string;
}

interface Type {
  encoding: string;
  numberOfBytes: string;
  label: string;
}

export interface StorageLayout {
  storage: Storage[];
  types: { [type: string]: Type; }
}

export interface StorageInfo extends Storage {
  types: { [type: string]: Type; }
}

export type GetStorageAt = (address: string, position: string) => Promise<string>

/**
 * Function to get storage information of variable from storage layout.
 * @param storageLayout
 * @param variableName
 */
export const getStorageInfo = (storageLayout: StorageLayout, variableName: string): StorageInfo => {
  const { storage, types } = storageLayout;
  const targetState = storage.find((state) => state.label === variableName);

  // Throw if state variable could not be found in storage layout.
  if (!targetState) {
    throw new Error('Variable not present in storage layout.');
  }

  return {
    ...targetState,
    slot: utils.hexlify(BigNumber.from(targetState.slot)),
    types
  };
};

/**
 * Function to get the value from storage for a contract variable.
 * @param address
 * @param storageLayout
 * @param getStorageAt
 * @param variableName
 */
export const getStorageValue = async (address: string, storageLayout: StorageLayout, getStorageAt: GetStorageAt, variableName: string): Promise<number | string | boolean> => {
  const { slot, offset, type, types } = getStorageInfo(storageLayout, variableName);
  const { encoding, numberOfBytes, label } = types[type];
  let storageValue: string;

  // Get value according to encoding i.e. how the data is encoded in storage.
  // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#json-output
  switch (encoding) {
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
    case 'inplace':
      storageValue = await getInplaceValue(address, slot, offset, numberOfBytes, getStorageAt);
      break;

    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
    case 'bytes':
      storageValue = await getBytesValue(address, slot, getStorageAt);
      break;

    default:
      throw new Error(`Encoding ${encoding} not implmented.`);
  }

  return getValueByLabel(storageValue, label);
};

/**
 * Get value according to type described by the label.
 * @param storageValue
 * @param label
 */
export const getValueByLabel = (storageValue: string, label: string): number | string | boolean => {
  // Parse value for boolean type.
  if (label === 'bool') {
    return !BigNumber.from(storageValue).isZero();
  }

  // Parse value for uint/int type or enum type.
  if (label.match(/^enum|u?int[0-9]+/)) {
    return BigNumber.from(storageValue).toNumber();
  }

  // Parse value for string type.
  if (label.includes('string')) {
    return utils.toUtf8String(storageValue);
  }

  return storageValue;
};

/**
 * Function to get value for inplace encoding.
 * @param address
 * @param slot
 * @param offset
 * @param numberOfBytes
 * @param getStorageAt
 */
const getInplaceValue = async (address: string, slot: string, offset: number, numberOfBytes: string, getStorageAt: GetStorageAt) => {
  const value = await getStorageAt(address, slot);
  const valueLength = utils.hexDataLength(value);

  // Get value according to offset.
  const start = valueLength - (offset + Number(numberOfBytes));
  const end = valueLength - offset;

  return utils.hexDataSlice(value, start, end);
};

/**
 * Function to get value for bytes encoding.
 * @param address
 * @param slot
 * @param getStorageAt
 */
const getBytesValue = async (address: string, slot: string, getStorageAt: GetStorageAt) => {
  const value = await getStorageAt(address, slot);
  let length = 0;

  // Get length of bytes stored.
  if (BigNumber.from(utils.hexDataSlice(value, 0, 1)).isZero()) {
    // If first byte is not set, get length directly from the zero padded byte array.
    const slotValue = BigNumber.from(value);
    length = slotValue.sub(1).div(2).toNumber();
  } else {
    // If first byte is set the length is lesser than 32 bytes.
    // Length of the value can be computed from the last byte.
    const lastByteHex = utils.hexDataSlice(value, 31, 32);
    length = BigNumber.from(lastByteHex).div(2).toNumber();
  }

  // Get value from the byte array directly if length is less than 32.
  if (length < 32) {
    return utils.hexDataSlice(value, 0, length);
  }

  // Array to hold multiple bytes32 data.
  const values = [];

  // Compute zero padded hexstring to calculate hashed position of storage.
  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const paddedSlotHex = utils.hexZeroPad(slot, 32);
  const position = utils.keccak256(paddedSlotHex);

  // Get value from consecutive storage slots for longer data.
  for (let i = 0; i < length / 32; i++) {
    const value = await getStorageAt(address, BigNumber.from(position).add(i).toHexString());
    values.push(value);
  }

  // Slice trailing bytes according to length of value.
  return utils.hexDataSlice(utils.hexConcat(values), 0, length);
};
