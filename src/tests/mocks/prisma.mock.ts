import { vi } from "vitest";

export const prismaMock = {
  // Loan operations
  loan: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },

  // Payment operations
  payment: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  },

  // Client operations
  client: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },

  // User operations
  user: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },

  // PaymentSchedule operations
  paymentSchedule: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn().mockResolvedValue({ _sum: { principalExpected: null, expectedAmount: null } }),
    groupBy: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },

  // SystemConfig operations
  systemConfig: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },

  // AuditLog operations
  auditLog: {
    create: vi.fn().mockResolvedValue({
      id: "audit-1",
      userId: "user-1",
      action: "TEST_ACTION",
      entity: "TEST",
      entityId: "test-1",
      details: {},
      createdAt: new Date(),
    }),
  },

  // Transaction support
  $transaction: vi.fn(),
};

// Type for better intellisense
export type PrismaMock = typeof prismaMock;
