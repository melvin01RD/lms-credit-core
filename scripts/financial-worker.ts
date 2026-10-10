import { createPayment, reversePayment } from "../lib/services/payment.service";
import { cancelLoan } from "../lib/services/loan.service";
import { prisma } from "../lib/db/prisma";

async function main() {
  // Parent releases the whole batch only after every independent process is ready.
  if (process.send) {
    await new Promise<void>(resolve => {
      process.once("message", () => resolve());
      process.send!({ ready: true });
    });
    process.disconnect!();
  }
  const [operation, encoded] = process.argv.slice(2);
  const data = JSON.parse(encoded);
  if (data.paymentDate) data.paymentDate = new Date(data.paymentDate);
  const result = operation === "payment" ? await createPayment(data)
    : operation === "reverse" ? await reversePayment(data.paymentId, data.userId, "integration test")
    : await cancelLoan(data.loanId, data.userId);
  process.stdout.write(JSON.stringify({ ok: true, result }));
}
main().catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, code: error.code, message: error.message }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
