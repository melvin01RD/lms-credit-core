import { describe, it, expect, vi } from "vitest";
import "./setup";
import { POST } from "@/app/api/payments/route";
import { createPayment } from "@/lib/services";
describe("Mobile payment API security", () => {
  it("uses session identity and propagates the retry key", async () => {
    vi.mocked(createPayment).mockResolvedValueOnce({ payment: { id: "p" } } as never);
    const response = await POST(new Request("http://localhost/api/payments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "controlled-retry-key" }, body: JSON.stringify({ loanId: "loan-1", totalAmount: 1000, createdById: "forged-user" }) }));
    expect(response.status).toBe(201);
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ createdById: "user-1", idempotencyKey: "controlled-retry-key" }));
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
