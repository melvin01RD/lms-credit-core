import { prisma } from "@/lib/db/prisma";
import { PaymentFrequency } from "@prisma/client";

export interface LoanProductInput {
  name: string;
  defaultRate: number;
  paymentFrequency: PaymentFrequency;
  termCount: number;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export async function getLoanProducts(includeInactive = false) {
  return prisma.loanProduct.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { name: "asc" },
  });
}

export async function createLoanProduct(data: LoanProductInput) {
  return prisma.loanProduct.create({
    data: {
      name: data.name.trim(),
      defaultRate: data.defaultRate,
      paymentFrequency: data.paymentFrequency,
      termCount: data.termCount,
      minAmount: data.minAmount ?? null,
      maxAmount: data.maxAmount ?? null,
    },
  });
}

export async function updateLoanProduct(id: string, data: Partial<LoanProductInput>) {
  return prisma.loanProduct.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.defaultRate !== undefined && { defaultRate: data.defaultRate }),
      ...(data.paymentFrequency !== undefined && { paymentFrequency: data.paymentFrequency }),
      ...(data.termCount !== undefined && { termCount: data.termCount }),
      ...(data.minAmount !== undefined && { minAmount: data.minAmount ?? null }),
      ...(data.maxAmount !== undefined && { maxAmount: data.maxAmount ?? null }),
    },
  });
}

export async function toggleLoanProduct(id: string) {
  const product = await prisma.loanProduct.findUniqueOrThrow({ where: { id } });
  return prisma.loanProduct.update({
    where: { id },
    data: { active: !product.active },
  });
}
