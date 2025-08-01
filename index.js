#!/usr/bin/env node

const PlexTraktCLI = require('./cli');

const cli = new PlexTraktCLI();
const command = process.argv[2] || 'help';

cli.run(command).catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});