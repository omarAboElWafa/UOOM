#!/usr/bin/env node

// Simple startup script for development
const path = require('path');
const { spawn } = require('child_process');

// Point to the correct main file location in the monorepo build
const mainFile = path.join(__dirname, 'dist', 'apps', 'api-gateway', 'src', 'main.js');

console.log('Starting API Gateway...');
console.log('Main file:', mainFile);

const child = spawn('node', [mainFile], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '8080'
  }
});

child.on('error', (error) => {
  console.error('Failed to start API Gateway:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`API Gateway exited with code ${code}`);
  process.exit(code);
}); 