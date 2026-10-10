import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { POST as payments } from "@/app/api/payments/route";
import { POST as loanPayments } from "@/app/api/loans/[id]/payments/route";
import { createPayment } from "@/lib/services";
import { ServiceError } from "@/lib/errors";

describe.each([
  ["/api/payments", payments],
  ["/api/loans/loan-1/payments", loanPayments],
] as const)("payment contract: %s", (url, post) => {
  const send = (body: unknown, raw = false) => post(new Request(`http://localhost${url}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  }), { params: Promise.resolve({ id: "loan-1" }) });

  beforeEach(() => {
    vi.mocked(createPayment).mockReset();
    vi.mocked(createPayment).mockResolvedValue({ payment: { id: "p" } } as never);
  });
  it("passes the header key to the service and maps conflicts to HTTP 409", async () => {
    vi.mocked(createPayment).mockRejectedValue(new ServiceError("Conflicto", "IDEMPOTENCY_CONFLICT", 409));
    const response = await post(new Request(`http://localhost${url}`, { method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "contract-retry-001" },
      body: JSON.stringify({ loanId: "loan-1", totalAmount: 1000 }),
    }), { params: Promise.resolve({ id: "loan-1" }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "contract-retry-001" }));
  });
  it.each([undefined, "forged-user"])("uses the session actor regardless of supplied identity (%s)", async (createdById) => {
    const response = await send({ loanId: "loan-1", totalAmount: 1000, createdById });
    expect(response.status).toBe(201);
    expect(createPayment).toHaveBeenCalledWith({ loanId: "loan-1", totalAmount: 1000,
      type: "REGULAR", paymentDate: undefined, createdById: "user-1" });
  });
  it.each([0, -1, "1000", null, 0.001, 10000000000, {}, []])("rejects invalid amount %j", async (totalAmount) => {
    const response = await send({ loanId: "loan-1", totalAmount });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_AMOUNT");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["bad-date", "2026-02-30", "2026-10-10T00:00:00", 123, null])("rejects invalid dates %j", async (paymentDate) => {
    const response = await send({ loanId: "loan-1", totalAmount: 1000, paymentDate });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_PAYMENT_DATE");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["2026-10-09", "2026-10-09T10:30:00.000Z", "2026-10-09T10:30:00-04:00"])("accepts date %s", async (paymentDate) => {
    expect((await send({ loanId: "loan-1", totalAmount: 1000, paymentDate })).status).toBe(201);
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentDate: new Date(paymentDate) }));
  });
  it("rejects unknown payment types", async () => {
    expect((await send({ loanId: "loan-1", totalAmount: 1000, type: "UNKNOWN" })).status).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each([null, [], 123])("rejects non-object JSON %j", async (body) => {
    expect((await send(body)).status).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    expect((await send("{", true)).status).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("uses route loan identity or requires body identity", async () => {
    expect((await send({ totalAmount: 1000 })).status).toBe(url === "/api/payments" ? 400 : 201);
  });
  it("rejects a conflicting loan in a nested route", async () => {
    if (url === "/api/payments") return;
    expect((await send({ loanId: "other", totalAmount: 1000 })).status).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });
});
