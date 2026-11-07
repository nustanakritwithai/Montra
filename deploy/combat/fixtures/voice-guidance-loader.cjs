// Test-only loader executes the shipped classic module and exact shell wiring.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = function loadSource() {
  const root = path.join(__dirname, '../../..');
  const moduleSource = fs.readFileSync(path.join(root, 'src/client-modules/voice-guidance.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'src/client/audio/002-voice-guidance.js'), 'utf8');
  const end = shell.indexOf('  // Sound effects');
  assert(end > 0, 'Keep the SFX adapter in the shell after controller initialization');
  return moduleSource + '\n' + shell.slice(0, end);
};
