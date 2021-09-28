//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Writable } from 'stream';

const HOOKS_TEMPLATE_FILE = './templates/hooks-template.handlebars';
const EG_TEMPLATE_FILE = './templates/hooks-example-template.handlebars';

/**
 * Writes the hooks and hooks.example files generated from templates to a stream.
 * @param outStream A writable output stream to write the hooks file to.
 * @param egOutStream A writable output stream to write the hooks.example file to.
 */
export function exportHooks (hooksOutStream: Writable, egOutStream: Writable): void {
  const hooksTemplateString = fs.readFileSync(path.resolve(__dirname, HOOKS_TEMPLATE_FILE)).toString();
  const egTemplateString = fs.readFileSync(path.resolve(__dirname, EG_TEMPLATE_FILE)).toString();

  const hooksTemplate = Handlebars.compile(hooksTemplateString);
  const egTemplate = Handlebars.compile(egTemplateString);

  const hooks = hooksTemplate({});
  const eg = egTemplate({});

  hooksOutStream.write(hooks);
  egOutStream.write(eg);
}
