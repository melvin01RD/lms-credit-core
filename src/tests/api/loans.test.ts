import { describe, it, expect, vi, beforeEach } from "vitest";
import "../api/setup";
import { GET, POST } from "@/app/api/loans/route";
import { GET as GET_BY_ID, PATCH } from "@/app/api/loans/[id]/route";
import {
  getLoans,
  createLoan,
  getLoanById,
  cancelLoan,
  markLoanAsOverdue,
} from "@/lib/services";
import { LoanNotFoundError, PaymentNotAllowedError } from "@/lib/errors";
import { LoanStatus, PaymentFrequency, LoanStructure } from "@prisma/client";

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

const mockLoan = {
  id: "loan-1",
  clientId: "client-1",
  loanStructure: LoanStructure.FLAT_RATE,
  principalAmount: 10000,
  annualInterestRate: null,
  totalFinanceCharge: 2000,
  totalPayableAmount: 12000,
  paymentFrequency: PaymentFrequency.WEEKLY,
  termCount: 8,
  installmentAmount: 1500,
  remainingCapital: 12000,
  installmentsPaid: 0,
  nextDueDate: new Date(),
  status: LoanStatus.ACTIVE,
  guarantees: null,
  createdById: "user-1",
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  client: { id: "client-1", firstName: "Juan", lastName: "Pérez", documentId: "00112345678" },
};

const mockPaginatedLoans = {
  data: [mockLoan],
  pagination: {
    total: 1, page: 1, limit: 20,
    totalPages: 1, hasNext: false, hasPrev: false,
  },
};

// ============================================
// GET /api/loans
// ============================================

describe("GET /api/loans", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista paginada de préstamos", async () => {
    vi.mocked(getLoans).mockResolvedValue(mockPaginatedLoans);

    const req = makeRequest("http://localhost/api/loans");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("filtra por status", async () => {
    vi.mocked(getLoans).mockResolvedValue(mockPaginatedLoans);

    const req = makeRequest("http://localhost/api/loans?status=ACTIVE");
    await GET(req);

    expect(getLoans).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
      expect.any(Object)
    );
  });

  it("retorna 401 sin sesión", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const req = makeRequest("http://localhost/api/loans");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("NOT_AUTHENTICATED");
  });
});

// ============================================
// POST /api/loans
// ============================================

describe("POST /api/loans", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea préstamo Flat Rate y retorna 201", async () => {
    vi.mocked(createLoan).mockResolvedValue(mockLoan);

    const req = makeRequest("http://localhost/api/loans", {
      method: "POST",
      body: {
        clientId: "client-1",
        principalAmount: 10000,
        totalFinanceCharge: 2000,
        paymentFrequency: "WEEKLY",
        termCount: 8,
        createdById: "user-1",
      },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.loanStructure).toBe("FLAT_RATE");
    expect(createLoan).toHaveBeenCalledWith(
      expect.objectContaining({ loanStructure: "FLAT_RATE" })
    );
  });

  it("retorna 400 cuando falta totalFinanceCharge", async () => {
    const req = makeRequest("http://localhost/api/loans", {
      method: "POST",
      body: {
        clientId: "client-1",
        principalAmount: 10000,
        paymentFrequency: "WEEKLY",
        termCount: 8,
        createdById: "user-1",
        // totalFinanceCharge: ausente intencionalmente
      },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ field: "totalFinanceCharge" })
    );
    expect(createLoan).not.toHaveBeenCalled();
  });
});

// ============================================
// GET /api/loans/[id]
// ============================================

describe("GET /api/loans/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna el préstamo por ID", async () => {
    vi.mocked(getLoanById).mockResolvedValue({ ...mockLoan, payments: [], paymentSchedule: [] });

    const req = makeRequest("http://localhost/api/loans/loan-1");
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await GET_BY_ID(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("loan-1");
  });

  it("retorna 404 cuando préstamo no existe", async () => {
    vi.mocked(getLoanById).mockRejectedValue(new LoanNotFoundError("non-existent"));

    const req = makeRequest("http://localhost/api/loans/non-existent");
    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const res = await GET_BY_ID(req, context);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("LOAN_NOT_FOUND");
  });
});

// ============================================
// PATCH /api/loans/[id]
// ============================================

describe("PATCH /api/loans/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancela un préstamo con action=cancel", async () => {
    vi.mocked(cancelLoan).mockResolvedValue({ ...mockLoan, status: LoanStatus.CANCELED });

    const req = makeRequest("http://localhost/api/loans/loan-1", {
      method: "PATCH",
      body: { action: "cancel", userId: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("CANCELED");
    expect(cancelLoan).toHaveBeenCalledWith("loan-1", "user-1");
  });

  it("marca como OVERDUE con action=mark_overdue", async () => {
    vi.mocked(markLoanAsOverdue).mockResolvedValue({ ...mockLoan, status: LoanStatus.OVERDUE });

    const req = makeRequest("http://localhost/api/loans/loan-1", {
      method: "PATCH",
      body: { action: "mark_overdue", userId: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("OVERDUE");
  });

  it("retorna 400 cuando falta userId", async () => {
    const req = makeRequest("http://localhost/api/loans/loan-1", {
      method: "PATCH",
      body: { action: "cancel" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("MISSING_USER_ID");
    expect(cancelLoan).not.toHaveBeenCalled();
  });

  it("retorna 400 para action inválido", async () => {
    const req = makeRequest("http://localhost/api/loans/loan-1", {
      method: "PATCH",
      body: { action: "invalid_action", userId: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_ACTION");
  });

  it("retorna 404 cuando préstamo no existe", async () => {
    vi.mocked(cancelLoan).mockRejectedValue(new LoanNotFoundError("non-existent"));

    const req = makeRequest("http://localhost/api/loans/non-existent", {
      method: "PATCH",
      body: { action: "cancel", userId: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("LOAN_NOT_FOUND");
  });

  it("retorna 400 cuando préstamo ya está pagado", async () => {
    // PaymentNotAllowedError.statusCode = 400 (no 422)
    vi.mocked(cancelLoan).mockRejectedValue(
      new PaymentNotAllowedError("loan-1", LoanStatus.PAID)
    );

    const req = makeRequest("http://localhost/api/loans/loan-1", {
      method: "PATCH",
      body: { action: "cancel", userId: "user-1" },
    });
    const context = { params: Promise.resolve({ id: "loan-1" }) };
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("PAYMENT_NOT_ALLOWED");
  });
});
