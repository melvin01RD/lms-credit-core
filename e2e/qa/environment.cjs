const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const dotenv = require('dotenv');

const baseURL = 'http://127.0.0.1:3117';
function validate(env) {
  const fail = () => { throw new Error('QA isolation rejected: require exact QA_EXPECTED_HOST, direct PostgreSQL lms_credit_qa and localhost:3117.'); };
  if (!env.QA_EXPECTED_HOST || !env.DATABASE_URL) fail();
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/lms_credit_qa' ||
      url.hostname !== env.QA_EXPECTED_HOST || !url.hostname.endsWith('.neon.tech') ||
      url.hostname.includes('-pooler') || !url.username || !url.password ||
      (url.port && url.port !== '5432') || url.searchParams.get('sslmode') !== 'require' ||
      [...url.searchParams.keys()].some(key => !['sslmode', 'channel_binding'].includes(key)) ||
      (env.BASE_URL && env.BASE_URL !== baseURL)) fail();
  for (const key of ['DIRECT_URL', 'DIRECT_DATABASE_URL', 'POSTGRES_URL', 'FINANCIAL_TEST_DATABASE_URL']) {
    if (env[key] && env[key] !== env.DATABASE_URL) fail();
  }
  return env.DATABASE_URL;
}
function loadQA() {
  const file = process.env.QA_ENV_FILE || path.resolve('.env.qa.local');
  let config;
  try { config = dotenv.parse(fs.readFileSync(file)); } catch { throw new Error('QA environment file unavailable.'); }
  // Never inherit a production DATABASE_URL or JWT secret from Next dotenv files.
  const env = { ...process.env, ...config };
  const databaseURL = validate(env);
  process.env.DATABASE_URL = databaseURL;
  process.env.BASE_URL = baseURL;
  process.env.QA_EXPECTED_HOST = env.QA_EXPECTED_HOST;
  process.env.JWT_SECRET = process.env.QA_SESSION_SECRET || randomBytes(48).toString('hex');
  process.env.QA_SESSION_SECRET = process.env.JWT_SECRET;
  return { DATABASE_URL: databaseURL, JWT_SECRET: process.env.JWT_SECRET,
    QA_SESSION_SECRET: process.env.JWT_SECRET, QA_EXPECTED_HOST: env.QA_EXPECTED_HOST,
    BASE_URL: baseURL, NEXT_DIST_DIR: '.next-qa-e2e', NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'test' };
}
module.exports = { baseURL, validate, loadQA };
