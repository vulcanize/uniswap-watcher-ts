//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/ipld-hook-template.handlebars';

/**
 * Writes the ipld-hook.ts file generated from a template to a stream.
 * @param outStream A writable output stream to write the ipld-hook.ts file to.
 */
export function exportIpldHook (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const ipldHook = template({});
  outStream.write(ipldHook);
}
