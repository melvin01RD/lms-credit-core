import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ServiceError } from "../errors";
import type { CreatePaymentInput, PaymentResult } from "./payment.service";

// Encode before JSON.stringify calls Date/Decimal.toJSON. Replays preserve service types.
function encode(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { kind: "Date", value: value.toISOString() };
  if (Prisma.Decimal.isDecimal(value)) return { kind: "Decimal", value: value.toString() };
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value as string | number | boolean;
}
function decode(value: Prisma.JsonValue): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decode);
  if (value.kind === "Date" && typeof value.value === "string") return new Date(value.value);
  if (value.kind === "Decimal" && typeof value.value === "string") return new Prisma.Decimal(value.value);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v!)]));
}

export async function withPaymentIdempotency(
  tx: Prisma.TransactionClient,
  data: CreatePaymentInput,
  create: () => Promise<PaymentResult>,
): Promise<PaymentResult> {
  if (data.idempotencyKey === undefined) return create();
  const key = data.idempotencyKey;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
    throw new ServiceError("Clave de reintento inválida", "INVALID_IDEMPOTENCY_KEY", 400);
  }
  const operation = "CREATE_PAYMENT";
  // Compatibility with keys committed by the previous AuditLog implementation.
  // Keep the old lock during rolling upgrades; never forget an already charged key.
  const legacyId = createHash("sha256").update(`${data.createdById}:${key}`).digest("hex");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${legacyId}, 0))`;
  const legacy = await tx.auditLog.findUnique({ where: { id: legacyId } });
  if (legacy?.action === "PAYMENT_IDEMPOTENCY") {
    const details = legacy.details as { fingerprint: string; result: Prisma.JsonValue };
    const oldFingerprint = createHash("sha256").update(JSON.stringify({
      loanId: data.loanId,
      amount: data.totalAmount, type: data.type, date: data.paymentDate?.toISOString() ?? null
    })).digest("hex");
    if (details.fingerprint !== oldFingerprint) throw new ServiceError("La clave ya se utilizó con otros datos", "IDEMPOTENCY_CONFLICT", 409);
    return restoreLegacyResult(details.result);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    loanId: data.loanId, amount: new Prisma.Decimal(data.totalAmount).toFixed(2),
    type: data.type, date: data.paymentDate?.toISOString() ?? null,
  })).digest("hex");
  // The unique index serializes even requests from different processes/loans.
  // An uncommitted reservation is invisible and rolls back with financial writes.
  await tx.$executeRaw`
    INSERT INTO "PaymentIdempotency" ("userId", "operation", "key", "fingerprint")
    VALUES (${data.createdById}, ${operation}, ${key}, ${fingerprint})
    ON CONFLICT ("userId", "operation", "key") DO NOTHING`;
  const record = await tx.paymentIdempotency.findUniqueOrThrow({
    where: { userId_operation_key: { userId: data.createdById, operation, key } },
  });
  if (record.fingerprint !== fingerprint) {
    throw new ServiceError("La clave ya se utilizó con otros datos", "IDEMPOTENCY_CONFLICT", 409);
  }
  if (record.result !== null) return decode(record.result) as PaymentResult;
  const result = await create();
  await tx.paymentIdempotency.update({
    where: { userId_operation_key: { userId: data.createdById, operation, key } },
    data: { result: encode(result)! },
  });
  return result;
}

function restoreLegacyResult(value: Prisma.JsonValue): PaymentResult {
  const result = structuredClone(value) as unknown as PaymentResult;
  for (const entity of [result.payment, result.loan]) {
    const row = entity as unknown as Record<string, unknown>;
    for (const field of ["paymentDate", "createdAt", "updatedAt", "nextDueDate", "approvalTokenExp", "approvedAt"]) {
      if (typeof row[field] === "string") row[field] = new Date(row[field] as string);
    }
    for (const field of ["totalAmount", "capitalApplied", "interestApplied", "lateFeeApplied", "principalAmount",
      "annualInterestRate", "totalFinanceCharge", "totalPayableAmount", "installmentAmount", "remainingCapital"]) {
      if (row[field] != null) row[field] = new Prisma.Decimal(row[field] as string);
    }
  }
  const client = (result.loan as unknown as { client?: Record<string, unknown> }).client;
  if (client) for (const field of ["createdAt", "updatedAt"]) {
    if (typeof client[field] === "string") client[field] = new Date(client[field] as string);
  }
  return result;
}
