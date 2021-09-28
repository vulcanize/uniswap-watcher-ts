//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const TEMPLATE_FILE = './templates/hooks-template.handlebars';

/**
 * Writes the hooks file generated from a template to a stream.
 * @param outStream A writable output stream to write the hooks file to.
 */
export function exportHooks (outStream: Writable): void {
  const templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  const template = Handlebars.compile(templateString);
  const hooks = template({});
  outStream.write(hooks);
}
