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

export type GetStorageAt = (param: { blockHash: string, contract: string, slot: string }) => Promise<{ value: string, proof: { data: string } }>

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
 * @param storageLayout
 * @param getStorageAt
 * @param blockHash
 * @param address
 * @param variableName
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const getStorageValue = async (storageLayout: StorageLayout, getStorageAt: GetStorageAt, blockHash: string, address: string, variableName: string): Promise<{ value: any, proof: { data: string } }> => {
  const { slot, offset, type, types } = getStorageInfo(storageLayout, variableName);
  const { encoding, numberOfBytes, label: typeLabel } = types[type];
  let value: string, proof: { data: string };

  // Get value according to encoding i.e. how the data is encoded in storage.
  // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#json-output
  switch (encoding) {
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
    case 'inplace':
      ({ value, proof } = await getInplaceValue(blockHash, address, slot, offset, numberOfBytes, getStorageAt));
      break;

    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
    case 'bytes':
      ({ value, proof } = await getBytesValue(blockHash, address, slot, getStorageAt));
      break;

    default:
      throw new Error(`Encoding ${encoding} not implemented.`);
  }

  return {
    value: getValueByType(value, typeLabel),
    proof
  };
};

/**
 * Get value according to type described by the label.
 * @param storageValue
 * @param typeLabel
 */
// getStorageByType
export const getValueByType = (storageValue: string, typeLabel: string): number | string | boolean => {
  // Parse value for boolean type.
  if (typeLabel === 'bool') {
    return !BigNumber.from(storageValue).isZero();
  }

  // Parse value for uint/int type or enum type.
  if (typeLabel.match(/^enum|u?int[0-9]+/)) {
    return BigNumber.from(storageValue).toNumber();
  }

  // Parse value for string type.
  if (typeLabel.includes('string')) {
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
const getInplaceValue = async (blockHash: string, address: string, slot: string, offset: number, numberOfBytes: string, getStorageAt: GetStorageAt) => {
  const { value, proof } = await getStorageAt({ blockHash, contract: address, slot });
  const valueLength = utils.hexDataLength(value);

  // Get value according to offset.
  const start = valueLength - (offset + Number(numberOfBytes));
  const end = valueLength - offset;

  return {
    value: utils.hexDataSlice(value, start, end),
    proof
  };
};

/**
 * Function to get value for bytes encoding.
 * @param address
 * @param slot
 * @param getStorageAt
 */
const getBytesValue = async (blockHash: string, address: string, slot: string, getStorageAt: GetStorageAt) => {
  const { value, proof } = await getStorageAt({ blockHash, contract: address, slot });
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
    return {
      value: utils.hexDataSlice(value, 0, length),
      proof
    };
  }

  // Array to hold multiple bytes32 data.
  const values = [];
  const proofs = [
    JSON.parse(proof.data)
  ];

  // Compute zero padded hexstring to calculate hashed position of storage.
  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const paddedSlotHex = utils.hexZeroPad(slot, 32);
  const position = utils.keccak256(paddedSlotHex);

  // Get value from consecutive storage slots for longer data.
  for (let i = 0; i < length / 32; i++) {
    const { value, proof } = await getStorageAt({
      blockHash,
      contract: address,
      slot: BigNumber.from(position).add(i).toHexString()
    });

    values.push(value);
    proofs.push(JSON.parse(proof.data));
  }

  // Slice trailing bytes according to length of value.
  return {
    value: utils.hexDataSlice(utils.hexConcat(values), 0, length),
    proof: {
      data: JSON.stringify(proofs)
    }
  };
};
