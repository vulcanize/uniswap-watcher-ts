import leftPad from 'left-pad';
import { ethers } from 'ethers';

export const padKey = input =>
  leftPad(ethers.utils.hexlify(input).replace('0x', ''), 64, '0');

export const getMappingSlot = (mappingSlot, key) => {
  const mappingSlotPadded = padKey(mappingSlot)
  const keyPadded = padKey(key)
  const fullKey = keyPadded.concat(mappingSlotPadded);
  const slot = ethers.utils.keccak256(`0x${fullKey}`);

  return slot
};

export const getStorageLeafKey = (slot) => ethers.utils.keccak256(slot);

// const slot = getMappingSlot("0x00", '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc');
// console.log("slot", slot);
// console.log("storage leaf key", getStorageLeafKey(slot));
