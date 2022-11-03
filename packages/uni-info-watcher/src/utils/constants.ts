//
// Copyright 2021 Vulcanize, Inc.
//

import { utils } from 'ethers';

import { KIND_FACTORY, KIND_NFPM } from '../entity/Contract';

export const ADDRESS_ZERO = utils.getAddress('0x0000000000000000000000000000000000000000');

export const FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
export const NFPM_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
export const BUNDLE_ID = '1';

export const FIRST_GRAFT_BLOCK = 13591197;

export const WATCHED_CONTRACTS = [
  {
    kind: KIND_FACTORY,
    address: FACTORY_ADDRESS,
    startingBlock: 12369621
  },
  {
    kind: KIND_NFPM,
    address: NFPM_ADDRESS,
    startingBlock: 12369651
  }
];
