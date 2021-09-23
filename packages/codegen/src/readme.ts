//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/readmeTemplate.handlebars';

export function exportReadme (folderName: string, contractName: string, outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const readmeString = template({
    folderName,
    contractName
  });
  outStream.write(readmeString);
}
