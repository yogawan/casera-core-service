// @/services/transactionService.test.ts
//
// Two focuses:
// 1. Loyalty-point reversal on cancellation (§5.3): a cancelled transaction
//    that was PAID must have its pointsEarned subtracted back from the
//    customer, exactly once. The cancel transition itself uses an atomic,
//    conditional findOneAndUpdate (not read-modify-write) so it can't race
//    a concurrent Midtrans webhook settling the same transaction — see
//    services/paymentService.test.ts for the symmetric webhook-side test.
// 2. createTransaction's employee validation (§5.5/§5.13, PLAN-GROOMA.md
//    Phase 10): employeeId must resolve to an ACTIVE Employee in the same
//    branch as the transaction, or creation is refused outright.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

interface FakeTransactionDoc {
  _id: string;
  branch: string;
  customer: string | null;
  transactionStatus: string;
  paymentStatus: string;
  pointsEarned: number;
}

let store: FakeTransactionDoc[] = [];

function matchesFilter(
  doc: FakeTransactionDoc,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const value = (doc as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === "object" && "$nin" in cond) {
      if ((cond as { $nin: unknown[] }).$nin.includes(value)) {
        return false;
      }
      continue;
    }
    if (value !== cond) {
      return false;
    }
  }
  return true;
}

const transactionFindById = vi.fn((...args: unknown[]) => {
  const [id] = args as [string];
  return Promise.resolve(store.find((doc) => doc._id === id) ?? null);
});

// Mirrors real MongoDB findOneAndUpdate semantics just enough to test the
// atomicity guarantee this code relies on: a filter that doesn't match
// (e.g. transactionStatus already CANCELLED) returns null rather than
// mutating anything.
const transactionFindOneAndUpdate = vi.fn((...args: unknown[]) => {
  const [filter, update, options] = args as [
    Record<string, unknown>,
    { $set: Record<string, unknown> },
    { new?: boolean }?,
  ];
  const idx = store.findIndex((doc) => matchesFilter(doc, filter));
  if (idx === -1) {
    return Promise.resolve(null);
  }
  const before = { ...store[idx] };
  store[idx] = { ...store[idx], ...update.$set };
  const after = { ...store[idx] };
  return Promise.resolve(options?.new ? after : before);
});

const transactionExists = vi.fn();
const transactionCreate = vi.fn();

vi.mock("@/models/Transaction", () => ({
  default: {
    findById: (...args: unknown[]) => transactionFindById(...args),
    findOneAndUpdate: (...args: unknown[]) =>
      transactionFindOneAndUpdate(...args),
    exists: (...args: unknown[]) => transactionExists(...args),
    create: (...args: unknown[]) => transactionCreate(...args),
  },
}));

const reverseLoyaltyPoints = vi.fn().mockResolvedValue(undefined);
const creditLoyaltyPoints = vi.fn().mockResolvedValue(undefined);
vi.mock("@/services/customerService", () => ({
  reverseLoyaltyPoints: (...args: unknown[]) => reverseLoyaltyPoints(...args),
  creditLoyaltyPoints: (...args: unknown[]) => creditLoyaltyPoints(...args),
}));

// createTransaction's own dependencies — not needed by the pre-existing
// cancelTransaction tests above, only by the employee-validation tests
// below (which stick to paymentMethod CASH and no customerId, so neither
// the QRIS/payment path nor @/models/Customer is ever reached).
const branchFindById = vi.fn();
vi.mock("@/models/Branch", () => ({
  default: { findById: (...args: unknown[]) => branchFindById(...args) },
}));

// PRD §5.14: Service is replaced by five category models. basePayload only
// ever sets haircutId, so Haircut is mocked unconditionally; Shaving is
// mocked too for the multi-category tests below (set haircutId + shavingId
// together). Treatment/Colouring/Chemical are imported for real by
// transactionService.ts but their findById is never reached by any payload
// in this file.
const haircutFindById = vi.fn();
vi.mock("@/models/Haircut", () => ({
  default: { findById: (...args: unknown[]) => haircutFindById(...args) },
}));

const shavingFindById = vi.fn();
vi.mock("@/models/Shaving", () => ({
  default: { findById: (...args: unknown[]) => shavingFindById(...args) },
}));

const employeeFindById = vi.fn();
vi.mock("@/models/Employee", () => ({
  default: { findById: (...args: unknown[]) => employeeFindById(...args) },
}));

const { cancelTransaction, createTransaction } = await import(
  "@/services/transactionService"
);

const HOST: SessionUser = {
  id: "host-1",
  username: "host",
  name: "Host",
  role: "HOST",
  branch: null,
  status: "ACTIVE",
};

const AGENT: SessionUser = {
  id: "agent-1",
  username: "agent",
  name: "Agent",
  role: "AGENT",
  branch: "branch-1",
  status: "ACTIVE",
};

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
});

describe("cancelTransaction loyalty point reversal", () => {
  it("reverses pointsEarned when cancelling a PAID transaction with a customer", async () => {
    store = [
      {
        _id: "txn-1",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-1");

    expect(reverseLoyaltyPoints).toHaveBeenCalledWith("cust-1", 25);
    expect(store[0].transactionStatus).toBe("CANCELLED");
  });

  it("does not reverse points when the transaction was never PAID", async () => {
    store = [
      {
        _id: "txn-2",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "PENDING",
        paymentStatus: "PENDING",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-2");

    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
    expect(store[0].transactionStatus).toBe("CANCELLED");
  });

  it("does not reverse points when there is no customer on the transaction", async () => {
    store = [
      {
        _id: "txn-3",
        branch: "branch-1",
        customer: null,
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-3");

    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
  });

  it("rejects cancelling an already-cancelled transaction and does not reverse points", async () => {
    store = [
      {
        _id: "txn-4",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "CANCELLED",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await expect(cancelTransaction(HOST, "txn-4")).rejects.toThrow(
      /already cancelled/,
    );
    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
  });

  it("double reversal: a second cancel attempt after a successful one never reverses twice", async () => {
    store = [
      {
        _id: "txn-5",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-5");
    expect(reverseLoyaltyPoints).toHaveBeenCalledTimes(1);

    await expect(cancelTransaction(HOST, "txn-5")).rejects.toThrow(
      /already cancelled/,
    );
    expect(reverseLoyaltyPoints).toHaveBeenCalledTimes(1);
  });

  it("rejects cancelling a completed transaction without touching points", async () => {
    store = [
      {
        _id: "txn-6",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "COMPLETED",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await expect(cancelTransaction(HOST, "txn-6")).rejects.toThrow(
      /Cannot cancel a completed transaction/,
    );
    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
    expect(store[0].transactionStatus).toBe("COMPLETED");
  });
});

describe("createTransaction employee validation", () => {
  // CASH + no customerId + no idempotencyKey so the only paths exercised
  // are branch/category/employee resolution and the final create() call —
  // the QRIS/payment and idempotency branches are untouched by this suite.
  const basePayload = {
    haircutId: "haircut-1",
    employeeId: "employee-1",
    paymentMethod: "CASH" as const,
    discountAmount: 0,
    serviceHourType: "REGULAR" as const,
  };

  beforeEach(() => {
    branchFindById.mockResolvedValue({
      _id: "branch-1",
      status: "ACTIVE",
      timezone: "Asia/Jakarta",
    });
    haircutFindById.mockResolvedValue({
      _id: "haircut-1",
      name: "Haircut",
      price: 50000,
      revenueSharing: { ownerPercentage: 50, employeePercentage: 50 },
    });
    transactionExists.mockResolvedValue(false);
    transactionCreate.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({ _id: "new-txn-1", ...data }),
    );
  });

  it("creates the transaction with the resolved employee when it is ACTIVE and in the same branch", async () => {
    employeeFindById.mockResolvedValue({
      _id: "employee-1",
      employmentStatus: "ACTIVE",
      branch: "branch-1",
    });

    await createTransaction(AGENT, basePayload);

    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ employee: "employee-1" }),
    );
  });

  it("rejects when the employee does not exist", async () => {
    employeeFindById.mockResolvedValue(null);

    await expect(createTransaction(AGENT, basePayload)).rejects.toThrow(
      /Employee is not available/,
    );
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it("rejects when the employee is not ACTIVE", async () => {
    employeeFindById.mockResolvedValue({
      _id: "employee-1",
      employmentStatus: "RESIGNED",
      branch: "branch-1",
    });

    await expect(createTransaction(AGENT, basePayload)).rejects.toThrow(
      /Employee is not available/,
    );
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it("rejects when the employee belongs to a different branch", async () => {
    employeeFindById.mockResolvedValue({
      _id: "employee-1",
      employmentStatus: "ACTIVE",
      branch: "branch-2",
    });

    await expect(createTransaction(AGENT, basePayload)).rejects.toThrow(
      /Employee is not available/,
    );
    expect(transactionCreate).not.toHaveBeenCalled();
  });
});

describe("createTransaction category resolution", () => {
  const basePayload = {
    haircutId: "haircut-1",
    employeeId: "employee-1",
    paymentMethod: "CASH" as const,
    discountAmount: 0,
    serviceHourType: "REGULAR" as const,
  };

  beforeEach(() => {
    branchFindById.mockResolvedValue({
      _id: "branch-1",
      status: "ACTIVE",
      timezone: "Asia/Jakarta",
    });
    haircutFindById.mockResolvedValue({
      _id: "haircut-1",
      name: "Haircut",
      price: 50000,
      revenueSharing: { ownerPercentage: 50, employeePercentage: 50 },
    });
    employeeFindById.mockResolvedValue({
      _id: "employee-1",
      employmentStatus: "ACTIVE",
      branch: "branch-1",
    });
    transactionExists.mockResolvedValue(false);
    transactionCreate.mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({ _id: "new-txn-1", ...data }),
    );
  });

  it("with exactly one category, sets only that ref/snapshot pair and uses the single-category formula", async () => {
    await createTransaction(AGENT, basePayload);

    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        haircut: "haircut-1",
        haircutSnapshot: expect.objectContaining({ name: "Haircut" }),
        subtotal: 50000,
        total: 50000,
        ownerRevenue: 25000,
        employeeRevenue: 25000,
      }),
    );
    expect(shavingFindById).not.toHaveBeenCalled();
  });

  it("with two categories, sets both ref/snapshot pairs and sums subtotal across them", async () => {
    shavingFindById.mockResolvedValue({
      _id: "shaving-1",
      name: "Shaving",
      price: 30000,
      revenueSharing: { ownerPercentage: 60, employeePercentage: 40 },
    });

    await createTransaction(AGENT, {
      ...basePayload,
      shavingId: "shaving-1",
    });

    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        haircut: "haircut-1",
        shaving: "shaving-1",
        subtotal: 80000,
        total: 80000,
        // haircut: 50% of 50,000 = 25,000. shaving: 60% of 30,000 = 18,000.
        ownerRevenue: 25000 + 18000,
        employeeRevenue: 25000 + 12000,
      }),
    );
  });

  it("rejects when a requested category id does not resolve to a document", async () => {
    shavingFindById.mockResolvedValue(null);

    await expect(
      createTransaction(AGENT, { ...basePayload, shavingId: "missing-1" }),
    ).rejects.toThrow(/Shaving is not available/);
    expect(transactionCreate).not.toHaveBeenCalled();
  });
});
