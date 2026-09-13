#!/usr/bin/env node
'use strict';

/**
 * Run the tracker against the fixture slate instead of live ESPN, so the UI
 * can be checked any time — mid-week, off-season, or behind a firewall.
 *
 *   npm run demo
 */

const { installStub } = require('./fixtures');

installStub();
console.log('DEMO MODE — serving fixture data, not live ESPN.\n');
require('../server.js');
