import { beforeEach, describe, expect, it } from "vitest";
import "./setup";
import { PaymentType } from "@prisma/client";
import { createPayment, reversePayment } from "@/lib/services/payment.service";
import { financialFixture } from "./financial-fixture";
const pay = (totalAmount = 300) => createPayment({ loanId: "loan-1", totalAmount, type: PaymentType.REGULAR, createdById: "user-1" });
describe("Payment reversals", () => {
  beforeEach(() => { financialFixture(); });
  it("restores the balance and records reason and original id", async () => {
    const p = await pay(); const r = await reversePayment(p.payment.id, "user-1", "Error");
    expect(r.newBalance).toBe(900); expect(r.payment.reversesPaymentId).toBe(p.payment.id); expect(r.payment.reversalReason).toBe("Error");
  });
  it("reactivates a fully paid loan", async () => {
    const p = await pay(900); expect((await reversePayment(p.payment.id, "user-1", "Error")).loan.status).toBe("ACTIVE");
  });
  it("rejects missing payments", async () => {
    await expect(reversePayment("missing", "user-1", "Error")).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });
  });
  it("rejects canceled loans", async () => {
    const s = financialFixture(); const p = await pay(); s.loan.status = "CANCELED";
    await expect(reversePayment(p.payment.id, "user-1", "Error")).rejects.toMatchObject({ code: "CANNOT_REVERSE_PAYMENT" });
  });
  it("rejects repeated reversals", async () => {
    const p = await pay(); await reversePayment(p.payment.id, "user-1", "Error");
    await expect(reversePayment(p.payment.id, "user-1", "Again")).rejects.toMatchObject({ code: "PAYMENT_ALREADY_REVERSED" });
  });
  it("rejects reversing a reversal", async () => {
    const p = await pay(); const r = await reversePayment(p.payment.id, "user-1", "Error");
    await expect(reversePayment(r.payment.id, "user-1", "Again")).rejects.toMatchObject({ code: "CANNOT_REVERSE_PAYMENT" });
  });
  it("requires a reason", async () => {
    const p = await pay(); await expect(reversePayment(p.payment.id, "user-1", "  ")).rejects.toMatchObject({ code: "CANNOT_REVERSE_PAYMENT" });
  });
});
