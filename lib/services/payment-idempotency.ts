import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ServiceError } from "../errors";
import { CreatePaymentInput, PaymentResult } from "./payment.service";

/** Durable replay record in existing AuditLog, committed with the payment.
 * PostgreSQL locks serialize the key and the loan across application instances.
 * No process-memory deduplication and no changes to financial formulas. */
export async function withPaymentIdempotency(
  data: CreatePaymentInput,
  key: string,
  create: (tx: Prisma.TransactionClient) => Promise<PaymentResult>,
): Promise<PaymentResult> {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new ServiceError("Clave de reintento inválida", "INVALID_IDEMPOTENCY_KEY", 400);
  const id = createHash("sha256").update(`${data.createdById}:${key}`).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify({ loanId: data.loanId, amount: data.totalAmount, type: data.type, date: data.paymentDate?.toISOString() ?? null })).digest("hex");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    const record = await tx.auditLog.findUnique({ where: { id } });
    if (record) {
      const details = record.details as { fingerprint: string; result: unknown };
      if (details.fingerprint !== fingerprint) throw new ServiceError("La clave ya se utilizó con otros datos", "IDEMPOTENCY_CONFLICT", 409);
      return details.result as PaymentResult;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.loanId}, 0))`;
    const result = await create(tx);
    await tx.auditLog.create({ data: { id, userId: data.createdById, action: "PAYMENT_IDEMPOTENCY", entity: "PAYMENT", entityId: result.payment.id, details: { fingerprint, result: JSON.parse(JSON.stringify(result)) } } });
    return result;
  }, { timeout: 15000 });
}
