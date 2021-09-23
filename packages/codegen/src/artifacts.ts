import solc from 'solc';
import { Writable } from 'stream';

export function exportArtifacts (outStream: Writable, contractContent: string, contractFileName: string, contractName: string): void {
  const input: any = {
    language: 'Solidity',
    sources: {},
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'storageLayout']
        }
      }
    }
  };

  input.sources[contractFileName] = {
    content: contractContent
  };

  // Get artifacts for the required contract.
  const output = JSON.parse(solc.compile(JSON.stringify(input))).contracts[contractFileName][contractName];
  outStream.write(JSON.stringify(output, null, 2));
}
