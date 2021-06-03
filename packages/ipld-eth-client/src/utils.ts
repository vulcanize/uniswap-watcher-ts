import leftPad from 'left-pad';
import { ethers } from 'ethers';

export const padKey = (input: string) =>
  leftPad(ethers.utils.hexlify(input).replace('0x', ''), 64, '0');

export const getMappingSlot = (mappingSlot: string, key: string) => {
  const mappingSlotPadded = padKey(mappingSlot);
  const keyPadded = padKey(key);
  const fullKey = keyPadded.concat(mappingSlotPadded);
  const slot = ethers.utils.keccak256(`0x${fullKey}`);

  return slot;
};

export const getStorageLeafKey = (slot: string) => ethers.utils.keccak256(slot);

export const topictoAddress = (topic: string) => {
  return ethers.utils.getAddress(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(topic), 20
    )
  );
};
