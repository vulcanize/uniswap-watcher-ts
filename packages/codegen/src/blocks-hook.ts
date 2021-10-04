//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/blocks-hook-template.handlebars';

/**
 * Writes the blocks-hook.ts file generated from a template to a stream.
 * @param outStream A writable output stream to write the blocks-hook.ts file to.
 */
export function exportBlocksHook (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const blocksHook = template({});
  outStream.write(blocksHook);
}
