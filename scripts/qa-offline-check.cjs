// Offline validation with ephemeral process-only values; no real database access.
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const jobs = {
  prisma: ['node_modules/prisma/build/index.js', 'validate'],
  types: ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'],
  'e2e-types': ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.qa-e2e.json'],
  unit: ['node_modules/vitest/vitest.mjs', 'run'],
  build: ['node_modules/next/dist/bin/next', 'build'],
};
const job = process.argv[2];
if (!jobs[job]) throw new Error('Unknown offline check');
const started = Date.now();
const result = spawnSync(process.execPath, jobs[job], { windowsHide: true, encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: `postgresql://qa:${randomBytes(16).toString('hex')}@127.0.0.1:1/offline_validation`,
    JWT_SECRET: randomBytes(48).toString('hex'), NEXT_TELEMETRY_DISABLED: '1' }, maxBuffer: 16 * 1024 * 1024 });
fs.mkdirSync('test-results/qa-offline', { recursive: true });
fs.writeFileSync(`test-results/qa-offline/${job}.txt`, (result.stdout || '') + (result.stderr || ''));
console.log(JSON.stringify({ job, exitCode: result.status, durationSeconds: (Date.now() - started) / 1000 }));
if (job !== 'build') console.log(result.stdout || '', result.stderr || '');
process.exitCode = result.status ?? 1;
