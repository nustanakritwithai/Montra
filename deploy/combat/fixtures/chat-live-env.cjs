'use strict';
// Test-process setup only: Colyseus tools otherwise repopulate the allowlisted
// child environment from /etc/environment and .env files at import time.
// Keep protocol, server and game behavior untouched; disable only dotenv input.
const path = require('node:path');
const { createRequire } = require('node:module');
const localRequire = createRequire(path.resolve(__dirname, '../../../combat-verify/package.json'));
const dotenv = localRequire('dotenv');
dotenv.config = () => ({ parsed: {} });
