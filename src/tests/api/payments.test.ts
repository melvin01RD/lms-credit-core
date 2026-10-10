import { describe, it, expect, vi, beforeEach } from "vitest";
import "../api/setup";
import { GET, POST } from "@/app/api/loans/[id]/payments/route";
import { getLoanPayments, createPayment } from "@/lib/services";
import {
  LoanNotFoundError,
  PaymentNotAllowedError,
  InvalidPaymentAmountError,
} from "@/lib/errors";
import { LoanStatus, PaymentType, Prisma } from "@prisma/client";

function makeRequest(
  url: string,
  options: { method?: string; body?: object } = {}
): Request {
  return new Request(url, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

const mockPayment = {
  createdBy: { id: "user-1", firstName: "Admin", lastName: "User" },
  id: "payment-1",
  loanId: "loan-1",
  paymentDate: new Date(),
  totalAmount: new Prisma.Decimal(1500),
  capitalApplied: new Prisma.Decimal(1111.11),
  interestApplied: new Prisma.Decimal(388.89),
  lateFeeApplied: new Prisma.Decimal(0),
  installmentsCovered: 1,
  type: PaymentType.REGULAR,
  createdById: "user-1",
  createdAt: new Date(),
};

// ============================================
// GET /api/loans/[id]/payments
// ============================================

describe("GET /api/loans/[id]/payments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista de pagos del préstamo", async () => {
    vi.mocked(getLoanPayments).mockResolvedValue([mockPayment]);

    const req = makeRequest("http://localhost/api/loans/loan-1/payments");
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await GET(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(getLoanPayments).toHaveBeenCalledWith("loan-1");
  });

  it("retorna 404 cuando préstamo no existe", async () => {
    vi.mocked(getLoanPayments).mockRejectedValue(new LoanNotFoundError("non-existent"));

    const req = makeRequest("http://localhost/api/loans/non-existent/payments");
    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const res = await GET(req, context);

    expect(res.status).toBe(404);
  });

  it("retorna 401 sin sesión", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const req = makeRequest("http://localhost/api/loans/loan-1/payments");
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await GET(req, context);

    expect(res.status).toBe(401);
  });
});

// ============================================
// POST /api/loans/[id]/payments
// ============================================

describe("POST /api/loans/[id]/payments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registra un pago y retorna 201", async () => {
    vi.mocked(createPayment).mockResolvedValue({
      payment: mockPayment,
      loan: {} as any,
      previousBalance: 12000,
      newBalance: 10500,
      statusChanged: false,
    });

    const req = makeRequest("http://localhost/api/loans/loan-1/payments", {
      method: "POST",
      body: {
        totalAmount: 1500,
        type: "REGULAR",
        createdById: "user-1",
      },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await POST(req, context);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.payment.id).toBe("payment-1");
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ loanId: "loan-1", totalAmount: 1500 })
    );
  });

  it("retorna 400 cuando préstamo ya está pagado", async () => {
    // PaymentNotAllowedError.statusCode = 400 (no 422)
    vi.mocked(createPayment).mockRejectedValue(
      new PaymentNotAllowedError("loan-1", LoanStatus.PAID)
    );

    const req = makeRequest("http://localhost/api/loans/loan-1/payments", {
      method: "POST",
      body: { totalAmount: 1500, type: "REGULAR", createdById: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await POST(req, context);

    expect(res.status).toBe(400);
  });

  it("retorna 400 cuando monto es inválido", async () => {
    vi.mocked(createPayment).mockRejectedValue(
      new InvalidPaymentAmountError("El monto debe ser mayor a cero")
    );

    const req = makeRequest("http://localhost/api/loans/loan-1/payments", {
      method: "POST",
      body: { totalAmount: 0, type: "REGULAR", createdById: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await POST(req, context);

    expect(res.status).toBe(400);
  });

  it("retorna 404 cuando préstamo no existe", async () => {
    vi.mocked(createPayment).mockRejectedValue(new LoanNotFoundError("non-existent"));

    const req = makeRequest("http://localhost/api/loans/non-existent/payments", {
      method: "POST",
      body: { totalAmount: 1500, type: "REGULAR", createdById: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const res = await POST(req, context);

    expect(res.status).toBe(404);
  });
});
