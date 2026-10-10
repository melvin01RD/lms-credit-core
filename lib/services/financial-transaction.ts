import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { LoanNotFoundError, ServiceError } from "../errors";

export async function financialTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10000,
        timeout: 15000,
      });
    } catch (error) {
      // Only retry errors that PostgreSQL guarantees have aborted the transaction.
      // Connection loss / uncertain commit must be resolved by the durable key.
      const known = error instanceof Prisma.PrismaClientKnownRequestError;
      const aborted = known && (error.code === "P2034" ||
        (error.code === "P2010" && ["40P01", "40001"].includes(String(error.meta?.code))));
      if (aborted && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (aborted || ["P1001", "P1002", "P1017", "P2024", "P2028", "P2034"].includes(error.code) ||
          (error.code === "P2010" && error.meta?.code === "55P03"))) {
        throw new ServiceError("No se pudo confirmar la operación. Reintente con la misma clave; sin clave, consulte el estado antes de reenviar.", "FINANCIAL_OPERATION_RETRYABLE", 503);
      }
      throw error;
    }
  }
}

/** Always acquire before reading financial state; held until commit/rollback. */
export async function lockLoan(tx: Prisma.TransactionClient, loanId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Loan" WHERE "id" = ${loanId} FOR UPDATE`;
  const loan = await tx.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError(loanId);
  return loan;
}
