// Local-only upgrade verification. Never reads .env or connects to a remote database.
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const url = new URL(process.env.FINANCIAL_TEST_DATABASE_URL || '');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55440' || url.pathname !== '/lms_finance_test') {
  throw new Error('Only the dedicated local financial test database is allowed');
}
const schema = `fi_history_${randomBytes(6).toString('hex')}`;
const migration = name => readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8');
const align = migration('0003_align_existing_schema');
const sql = `
CREATE SCHEMA "${schema}";
SET search_path TO "${schema}";
${migration('0001_baseline')}
${migration('0002_add_client_field_length_constraints')}
${align}
-- Already-provisioned additive schema changes must be harmless on upgrade.
${align}
INSERT INTO "User" (id,email,password,"firstName","lastName","updatedAt")
VALUES ('u','migration@test.invalid','unused','Test','User',now());
INSERT INTO "Client" (id,"firstName","documentId",phone,"updatedAt")
VALUES ('c','Test','00000000001','8090000000',now());
INSERT INTO "Loan" (id,"clientId","principalAmount","totalFinanceCharge","totalPayableAmount",
  "paymentFrequency","termCount","installmentAmount","remainingCapital","createdById","updatedAt")
VALUES ('l','c',800,200,1000,'DAILY',1,1000,1000,'u',now());
INSERT INTO "Payment" (id,"loanId","totalAmount","capitalApplied","interestApplied","lateFeeApplied","installmentsCovered",type,"createdById")
VALUES ('legacy-positive','l',1050,800,200,0,1,'REGULAR','u'),
       ('legacy-reversal','l',-1050,-800,-200,0,-1,'REGULAR','u');
INSERT INTO "AuditLog" (id,"userId",action,entity,"entityId",details)
VALUES ('legacy-key','u','PAYMENT_IDEMPOTENCY','PAYMENT','legacy-positive','{"result":{"legacy":true}}');
CREATE TEMP TABLE history_before AS SELECT row_to_json(p)::jsonb snapshot FROM "Payment" p;
${migration('0004_financial_consistency')}
DO $$ BEGIN
  IF (SELECT count(*) FROM "Payment") <> 2 OR EXISTS (SELECT snapshot FROM history_before EXCEPT
    SELECT row_to_json(p)::jsonb - 'reversalReason' - 'reversesPaymentId' FROM "Payment" p) THEN
    RAISE EXCEPTION 'Historical payments changed';
  END IF;
  IF (SELECT details->'result'->>'legacy' FROM "AuditLog" WHERE id='legacy-key') <> 'true' THEN
    RAISE EXCEPTION 'Legacy idempotency record changed';
  END IF;
  BEGIN
    INSERT INTO "Payment" (id,"loanId","totalAmount","capitalApplied","interestApplied",type,"createdById")
    VALUES ('invalid-new','l',1050,800,200,'REGULAR','u');
    RAISE EXCEPTION 'Unbalanced new payment accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "Payment" SET "paymentDate"=now() WHERE id='legacy-positive';
    RAISE EXCEPTION 'History update accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'PASS: additive upgrade, legacy rows and keys preserved, invalid new writes rejected' AS result;
-- Only the uniquely named schema created by this invocation is removed.
DROP SCHEMA "${schema}" CASCADE;
`;
const result = spawnSync('docker', ['exec', '-i', 'lms-financial-integrity-20261010',
  'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'finance_test', '-d', 'lms_finance_test'],
  { input: sql, encoding: 'utf8', windowsHide: true });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
