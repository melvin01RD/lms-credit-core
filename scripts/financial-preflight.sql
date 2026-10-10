-- Read-only preflight. Review on a restored backup before production cutover.
-- Do not fix ambiguous history by deleting or overwriting payments.
SELECT "loanId", "installmentNumber", count(*) AS duplicates
FROM "PaymentSchedule" GROUP BY "loanId", "installmentNumber" HAVING count(*) > 1;

SELECT id, "loanId", "totalAmount", "capitalApplied", "interestApplied", "lateFeeApplied"
FROM "Payment" WHERE "totalAmount" <> "capitalApplied" + "interestApplied" + "lateFeeApplied"
   OR "totalAmount" <= 0;

SELECT l.id, l.status, l."remainingCapital", l."totalPayableAmount", l."installmentsPaid",
       count(s.id) AS schedule_count,
       COALESCE(sum(s."expectedAmount") FILTER (WHERE s.status IN ('PENDING', 'OVERDUE')), 0) AS schedule_balance
FROM "Loan" l LEFT JOIN "PaymentSchedule" s ON s."loanId" = l.id
WHERE l.status::text <> 'DRAFT'
GROUP BY l.id
HAVING count(s.id) <> l."termCount"
    OR COALESCE(sum(s."expectedAmount") FILTER (WHERE s.status IN ('PENDING','OVERDUE')),0) <> l."remainingCapital"
    OR sum(s."expectedAmount") IS DISTINCT FROM l."totalPayableAmount"
    OR sum(s."principalExpected") IS DISTINCT FROM l."principalAmount"
    OR sum(s."interestExpected") IS DISTINCT FROM l."totalFinanceCharge"
    OR count(s.id) FILTER (WHERE s.status IN ('PAID','ADVANCE_PAID')) <> l."installmentsPaid";

SELECT id, "loanId", "installmentNumber" FROM "PaymentSchedule"
WHERE "expectedAmount" <= 0 OR "principalExpected" < 0 OR "interestExpected" < 0
   OR "expectedAmount" <> "principalExpected" + "interestExpected"
   OR (status IN ('PAID','ADVANCE_PAID') AND "paymentId" IS NULL)
   OR (status IN ('PENDING','OVERDUE') AND "paymentId" IS NOT NULL);

-- Before the upgrade every historical fee needs attribution review.
SELECT id, "loanId", "lateFeeApplied", "paymentDate" FROM "Payment" WHERE "lateFeeApplied" <> 0;

-- Inspect migration state/checksums, including the UTF-16 baseline normalization.
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM "_prisma_migrations" ORDER BY started_at;
