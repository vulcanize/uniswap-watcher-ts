import solc from 'solc';
import { Writable } from 'stream';

export function exportArtifacts (contractFileName: string, contractContent: string, outStream: Writable, contractName: string): void {
  const input: any = {
    language: 'Solidity',
    sources: {},
    settings: {
      outputSelection: {
        '*': {
          '*': ['*']
        }
      }
    }
  };

  input.sources[contractFileName] = {
    content: contractContent
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))).contracts[contractFileName][contractName];
  outStream.write(JSON.stringify(output, null, 2));
}
