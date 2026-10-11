BEGIN;

-- Fail before any changes if existing installment identities are ambiguous.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "PaymentSchedule" GROUP BY "loanId", "installmentNumber" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate installment numbers require reconciliation before financial migration';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversesPaymentId" TEXT;

-- CreateTable
CREATE TABLE "PaymentIdempotency" (
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIdempotency_pkey" PRIMARY KEY ("userId","operation","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversesPaymentId_key" ON "Payment"("reversesPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSchedule_loanId_installmentNumber_key" ON "PaymentSchedule"("loanId", "installmentNumber");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIdempotency" ADD CONSTRAINT "PaymentIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: service transactions also enforce these invariants.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts_balance"
  CHECK ("totalAmount" = "capitalApplied" + "interestApplied" + "lateFeeApplied") NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_direction"
  CHECK (("reversesPaymentId" IS NULL AND "totalAmount" > 0 AND "installmentsCovered" > 0
    AND "capitalApplied" >= 0 AND "interestApplied" >= 0 AND "lateFeeApplied" >= 0)
  OR ("reversesPaymentId" IS NOT NULL AND "reversesPaymentId" <> "id" AND "totalAmount" < 0
    AND "installmentsCovered" < 0 AND "capitalApplied" <= 0 AND "interestApplied" <= 0 AND "lateFeeApplied" <= 0
    AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0)) NOT VALID;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_balance_bounds"
  CHECK ("remainingCapital" >= 0 AND "installmentsPaid" >= 0 AND "installmentsPaid" <= "termCount") NOT VALID;

CREATE TABLE "PaymentLateFeeAllocation" (
  "paymentId" TEXT NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scheduleId" TEXT NOT NULL REFERENCES "PaymentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" <> 0),
  PRIMARY KEY ("paymentId", "scheduleId")
);
CREATE INDEX "PaymentLateFeeAllocation_scheduleId_idx" ON "PaymentLateFeeAllocation"("scheduleId");

-- Preserve historical records, including legacy negative payments without a link.
-- New writes must satisfy checks; history is reconciled explicitly, never rewritten here.
CREATE FUNCTION reject_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial history is immutable; append a compensating payment' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "Payment_immutable" BEFORE UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();
CREATE TRIGGER "PaymentLateFeeAllocation_immutable" BEFORE UPDATE OR DELETE ON "PaymentLateFeeAllocation"
FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();
COMMIT;
