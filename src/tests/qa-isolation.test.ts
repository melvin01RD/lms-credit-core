import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
const { validate } = require('../../e2e/qa/environment.cjs');
const host = 'ep-synthetic-qa.neon.tech';
const url = `postgresql://qa:${randomBytes(16).toString('hex')}@${host}/lms_credit_qa?sslmode=require`;
const valid = { DATABASE_URL: url, QA_EXPECTED_HOST: host };
describe('QA connection guard (no connections or writes)', () => {
  it('accepts the independently pinned direct QA endpoint', () => expect(validate(valid)).toBe(url));
  it.each([
    { QA_EXPECTED_HOST: '' }, { QA_EXPECTED_HOST: 'ep-other.neon.tech' },
    { DATABASE_URL: url.replace('/lms_credit_qa', '/production') },
    { DATABASE_URL: url.replace('postgresql:', 'https:') },
    { DATABASE_URL: url.replace(host, 'ep-synthetic-qa-pooler.neon.tech'), QA_EXPECTED_HOST: 'ep-synthetic-qa-pooler.neon.tech' },
    { DATABASE_URL: url.replace('?sslmode=require', '') },
    { DATABASE_URL: `${url}&schema=production` },
    { BASE_URL: 'https://example.vercel.app' }, { DIRECT_URL: 'different' },
  ])('rejects unsafe or ambiguous configuration %#', patch => {
    expect(() => validate({ ...valid, ...patch })).toThrow('QA isolation rejected');
  });
});
