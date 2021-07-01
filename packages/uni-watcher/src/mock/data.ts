// TODO: Pull mock data for 5 tokens from rinkeby.

export const tokens: {[address: string]: {[variable: string]: string}} = {
  '0xd87fea54f506972e3267239ec8e159548892074a': {
    name: 'ChainLink Token',
    symbol: 'LINK',
    decimals: '18',
    totalSupply: '1000000'
  }
};

export const blocks: {[blockHash: string]: {[address: string]: any}} = {
  // Block hash.
  '0x77b5479a5856dd8ec63df6aabf9ce0913071a6dda3a3d54f3c9c940574bcb8ab': {

    // ERC20 token address.
    '0xd87fea54f506972e3267239ec8e159548892074a': {
      ...tokens['0xd87fea54f506972e3267239ec8e159548892074a'],

      events: [
        {
          name: 'Transfer',
          from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
          to: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
          value: '500'
        },
        {
          name: 'Approval',
          owner: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
          spender: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
          value: '100'
        }
      ]
    }
  }
};
