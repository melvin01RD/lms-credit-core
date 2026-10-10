-- CreateEnum
DO $$ BEGIN CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "collectionDays" "DayOfWeek"[] DEFAULT ARRAY[]::"DayOfWeek"[];

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS     "approvalToken" TEXT,
ADD COLUMN IF NOT EXISTS     "approvalTokenExp" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "approvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "approvedByName" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoanProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultRate" DECIMAL(5,2) NOT NULL,
    "paymentFrequency" "PaymentFrequency" NOT NULL,
    "termCount" INTEGER NOT NULL,
    "minAmount" DECIMAL(12,2),
    "maxAmount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoanProduct_name_key" ON "LoanProduct"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Loan_approvalToken_key" ON "Loan"("approvalToken");
