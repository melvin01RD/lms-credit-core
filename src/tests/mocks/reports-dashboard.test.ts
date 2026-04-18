import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup";
import { getDashboardMetrics } from "../../../lib/services/reports.service";
import { LoanStatus, PaymentFrequency, PaymentType } from "@prisma/client";
import { prismaMock } from "./prisma.mock";

// ============================================
// Helpers: mock data for reports
// ============================================

const createReportLoan = (overrides = {}) => ({
  id: "loan-1",
  principalAmount: 10000,
  remainingCapital: 8000,
  status: LoanStatus.ACTIVE,
  createdAt: new Date(),
  nextDueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
  installmentAmount: 942.52,
  client: {
    id: "client-1",
    firstName: "Juan",
    lastName: "Pérez",
    documentId: "001-1234567-8",
  },
  ...overrides,
});

const createReportPayment = (overrides = {}) => ({
  totalAmount: 1000,
  capitalApplied: 800,
  interestApplied: 150,
  lateFeeApplied: 50,
  paymentDate: new Date(),
  ...overrides,
});

// ============================================
// getDashboardMetrics - Core Metrics
// ============================================

describe("getDashboardMetrics - Core Metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate all main metrics correctly", async () => {
    const loans = [
      createReportLoan({ principalAmount: 10000, remainingCapital: 8000, status: LoanStatus.ACTIVE }),
      createReportLoan({ id: "loan-2", principalAmount: 20000, remainingCapital: 15000, status: LoanStatus.ACTIVE }),
      createReportLoan({ id: "loan-3", principalAmount: 5000, remainingCapital: 0, status: LoanStatus.PAID }),
      createReportLoan({ id: "loan-4", principalAmount: 8000, remainingCapital: 7000, status: LoanStatus.OVERDUE }),
    ];

    const payments = [
      createReportPayment({ totalAmount: 1000, capitalApplied: 800, interestApplied: 150, lateFeeApplied: 50 }),
      createReportPayment({ totalAmount: 2000, capitalApplied: 1700, interestApplied: 250, lateFeeApplied: 50 }),
    ];

    const paymentsThisMonth = [
      { totalAmount: 1500 },
      { totalAmount: 800 },
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce(payments)        // all payments
      .mockResolvedValueOnce(paymentsThisMonth); // payments this month
    prismaMock.client.count.mockResolvedValue(3);
    // BUG-S1-04: aggregate provides totalOutstanding (pendingPrincipal) and overdueAmount
    prismaMock.paymentSchedule.aggregate
      .mockResolvedValueOnce({ _sum: { principalExpected: 30000 } })
      .mockResolvedValueOnce({ _sum: { expectedAmount: 7000 } });

    const result = await getDashboardMetrics();

    // Total loaned = 10000 + 20000 + 5000 + 8000
    expect(result.totalLoaned).toBe(43000);

    // Outstanding = principalExpected from paymentSchedule.aggregate (BUG-S1-04)
    expect(result.totalOutstanding).toBe(30000);

    // Interest = 150 + 250
    expect(result.totalInterest).toBe(400);

    // Late fees = 50 + 50
    expect(result.totalLateFees).toBe(100);

    // Loan counts by status — activeLoans = ACTIVE + OVERDUE (BUG-S1-02)
    expect(result.activeLoans).toBe(3);
    expect(result.overdueLoans).toBe(1);
    expect(result.paidLoans).toBe(1);

    // Active clients
    expect(result.activeClients).toBe(3);

    // Payments this month
    expect(result.paymentsThisMonth).toBe(2);
    expect(result.paymentsThisMonthAmount).toBe(2300);
  });

  it("should return arrays for chart data", async () => {
    prismaMock.loan.findMany.mockResolvedValue([createReportLoan()]);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([createReportPayment()])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(1);

    const result = await getDashboardMetrics();

    // Should have 6 months of data
    expect(result.loansByMonth).toHaveLength(6);
    expect(result.paymentsByMonth).toHaveLength(6);

    // Portfolio distribution should exist
    expect(result.portfolioDistribution).toBeDefined();
    expect(Array.isArray(result.portfolioDistribution)).toBe(true);

    // Upcoming payments should be an array
    expect(Array.isArray(result.upcomingPayments)).toBe(true);
  });

  it("should handle empty database gracefully", async () => {
    prismaMock.loan.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(0);

    const result = await getDashboardMetrics();

    expect(result.totalLoaned).toBe(0);
    expect(result.totalOutstanding).toBe(0);
    expect(result.totalInterest).toBe(0);
    expect(result.totalLateFees).toBe(0);
    expect(result.activeLoans).toBe(0);
    expect(result.overdueLoans).toBe(0);
    expect(result.paidLoans).toBe(0);
    expect(result.activeClients).toBe(0);
    expect(result.paymentsThisMonth).toBe(0);
    expect(result.paymentsThisMonthAmount).toBe(0);
    expect(result.loansByMonth).toHaveLength(6);
    expect(result.paymentsByMonth).toHaveLength(6);
    expect(result.portfolioDistribution).toHaveLength(0);
    expect(result.upcomingPayments).toHaveLength(0);
  });
});

// ============================================
// getDashboardMetrics - Portfolio Distribution
// ============================================

describe("getDashboardMetrics - Portfolio Distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate portfolio distribution percentages", async () => {
    const loans = [
      createReportLoan({ status: LoanStatus.ACTIVE }),
      createReportLoan({ id: "loan-2", status: LoanStatus.ACTIVE }),
      createReportLoan({ id: "loan-3", status: LoanStatus.PAID, remainingCapital: 0 }),
      createReportLoan({ id: "loan-4", status: LoanStatus.OVERDUE }),
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(2);

    const result = await getDashboardMetrics();

    const activeDistribution = result.portfolioDistribution.find((d) => d.status === "Activos");
    const paidDistribution = result.portfolioDistribution.find((d) => d.status === "Pagados");
    const overdueDistribution = result.portfolioDistribution.find((d) => d.status === "En Mora");

    expect(activeDistribution?.count).toBe(2);
    expect(activeDistribution?.percentage).toBe(50);
    expect(paidDistribution?.count).toBe(1);
    expect(paidDistribution?.percentage).toBe(25);
    expect(overdueDistribution?.count).toBe(1);
    expect(overdueDistribution?.percentage).toBe(25);
  });

  it("should use principalAmount for PAID loans and remainingCapital for others", async () => {
    const loans = [
      createReportLoan({ status: LoanStatus.ACTIVE, principalAmount: 10000, remainingCapital: 8000 }),
      createReportLoan({ id: "loan-2", status: LoanStatus.PAID, principalAmount: 5000, remainingCapital: 0 }),
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(1);

    const result = await getDashboardMetrics();

    const activeDistribution = result.portfolioDistribution.find((d) => d.status === "Activos");
    const paidDistribution = result.portfolioDistribution.find((d) => d.status === "Pagados");

    // ACTIVE uses remainingCapital
    expect(activeDistribution?.amount).toBe(8000);
    // PAID uses principalAmount
    expect(paidDistribution?.amount).toBe(5000);
  });
});

// ============================================
// getDashboardMetrics - Upcoming Payments
// ============================================

describe("getDashboardMetrics - Upcoming Payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return loans due within 7 days", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);

    const inTenDays = new Date();
    inTenDays.setDate(inTenDays.getDate() + 10);

    const loans = [
      createReportLoan({ nextDueDate: tomorrow, status: LoanStatus.ACTIVE, installmentAmount: 500 }),
      createReportLoan({ id: "loan-2", nextDueDate: inThreeDays, status: LoanStatus.ACTIVE, installmentAmount: 800 }),
      createReportLoan({ id: "loan-3", nextDueDate: inTenDays, status: LoanStatus.ACTIVE, installmentAmount: 1000 }), // outside 7 days
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(1);

    const result = await getDashboardMetrics();

    // Only loans within 7 days
    expect(result.upcomingPayments.length).toBe(2);
    // Should be sorted by daysUntilDue ascending
    expect(result.upcomingPayments[0].daysUntilDue).toBeLessThanOrEqual(
      result.upcomingPayments[1].daysUntilDue
    );
  });

  it("should include overdue loans in upcoming payments", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const loans = [
      createReportLoan({ nextDueDate: yesterday, status: LoanStatus.OVERDUE }),
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(1);

    const result = await getDashboardMetrics();

    expect(result.upcomingPayments.length).toBe(1);
    expect(result.upcomingPayments[0].daysUntilDue).toBeLessThan(0);
  });

  it("should not include PAID or CANCELED loans in upcoming", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const loans = [
      createReportLoan({ nextDueDate: tomorrow, status: LoanStatus.PAID }),
      createReportLoan({ id: "loan-2", nextDueDate: tomorrow, status: LoanStatus.CANCELED }),
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(0);

    const result = await getDashboardMetrics();

    expect(result.upcomingPayments).toHaveLength(0);
  });

  it("should limit upcoming payments to 10", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Create 15 loans all due tomorrow
    const loans = Array.from({ length: 15 }, (_, i) =>
      createReportLoan({ id: `loan-${i}`, nextDueDate: tomorrow, status: LoanStatus.ACTIVE })
    );

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(5);

    const result = await getDashboardMetrics();

    expect(result.upcomingPayments.length).toBeLessThanOrEqual(10);
  });
});

// ============================================
// getDashboardMetrics - Monthly Data
// ============================================

describe("getDashboardMetrics - Monthly Data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should always return 6 months of loan data", async () => {
    prismaMock.loan.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(0);

    const result = await getDashboardMetrics();

    expect(result.loansByMonth).toHaveLength(6);
    result.loansByMonth.forEach((month) => {
      expect(month).toHaveProperty("month");
      expect(month).toHaveProperty("count");
      expect(month).toHaveProperty("amount");
    });
  });

  it("should always return 6 months of payment data", async () => {
    prismaMock.loan.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(0);

    const result = await getDashboardMetrics();

    expect(result.paymentsByMonth).toHaveLength(6);
    result.paymentsByMonth.forEach((month) => {
      expect(month).toHaveProperty("month");
      expect(month).toHaveProperty("count");
      expect(month).toHaveProperty("amount");
      expect(month).toHaveProperty("capital");
      expect(month).toHaveProperty("interest");
    });
  });

  it("should aggregate loans by month correctly", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    const loans = [
      createReportLoan({ createdAt: thisMonth, principalAmount: 10000 }),
      createReportLoan({ id: "loan-2", createdAt: thisMonth, principalAmount: 5000 }),
      createReportLoan({ id: "loan-3", createdAt: lastMonth, principalAmount: 20000 }),
    ];

    prismaMock.loan.findMany.mockResolvedValue(loans);
    prismaMock.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(2);

    const result = await getDashboardMetrics();

    // The last entry should be current month
    const currentMonthData = result.loansByMonth[5];
    expect(currentMonthData.count).toBe(2);
    expect(currentMonthData.amount).toBe(15000);

    // Previous month
    const prevMonthData = result.loansByMonth[4];
    expect(prevMonthData.count).toBe(1);
    expect(prevMonthData.amount).toBe(20000);
  });

  it("should aggregate payments by month with capital and interest breakdown", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 10);

    const payments = [
      createReportPayment({ paymentDate: thisMonth, totalAmount: 1000, capitalApplied: 800, interestApplied: 200 }),
      createReportPayment({ paymentDate: thisMonth, totalAmount: 500, capitalApplied: 400, interestApplied: 100 }),
    ];

    prismaMock.loan.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany
      .mockResolvedValueOnce(payments)
      .mockResolvedValueOnce([]);
    prismaMock.client.count.mockResolvedValue(0);

    const result = await getDashboardMetrics();

    const currentMonthPayments = result.paymentsByMonth[5];
    expect(currentMonthPayments.count).toBe(2);
    expect(currentMonthPayments.amount).toBe(1500);
    expect(currentMonthPayments.capital).toBe(1200);
    expect(currentMonthPayments.interest).toBe(300);
  });
});
