// @/services/employeeService.test.ts
//
// PRD §7.3a / Phase 13 — listEmployees() unit tests.
//
// Tests verify the authorization contract (branch scoping), status filter,
// field serialization, and pagination. The DB is fully mocked — no real
// MongoDB needed (consistent with every other service test in this repo).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fake Employee documents (lean() shape — plain objects, not Mongoose docs)
// ---------------------------------------------------------------------------

type FakeEmployeeDoc = {
  _id: string;
  user: { name: string } | null;
  branch: { _id: string; name: string } | null;
  employmentStatus: string;
};

const BRANCH_A = { _id: "bbbbbbbbbbbbbbbbbbbbbb01", name: "Branch A" };
const BRANCH_B = { _id: "bbbbbbbbbbbbbbbbbbbbbb02", name: "Branch B" };

const EMPLOYEES: FakeEmployeeDoc[] = [
  {
    _id: "eeeeeeeeeeeeeeeeeeeeee01",
    user: { name: "Budi Santoso" },
    branch: BRANCH_A,
    employmentStatus: "ACTIVE",
  },
  {
    _id: "eeeeeeeeeeeeeeeeeeeeee02",
    user: { name: "Citra Lestari" },
    branch: BRANCH_B,
    employmentStatus: "ACTIVE",
  },
];

// ---------------------------------------------------------------------------
// Mock EmployeeModel — mirrors the chained Mongoose query API used in the
// service (find → populate → populate → select → sort → skip → limit → lean)
// ---------------------------------------------------------------------------

let _mockFindFilter: Record<string, unknown> = {};
let mockFindResult: FakeEmployeeDoc[] = [];
let mockCountResult = 0;

const buildChain = (docs: FakeEmployeeDoc[]) => ({
  populate: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(docs),
});

const employeeFind = vi.fn((filter: Record<string, unknown>) => {
  _mockFindFilter = filter;
  return buildChain(mockFindResult);
});

const employeeCountDocuments = vi.fn((_filter?: Record<string, unknown>) =>
  Promise.resolve(mockCountResult),
);

vi.mock("@/models/Employee", () => ({
  default: {
    find: (filter: Record<string, unknown>) => employeeFind(filter),
    countDocuments: (filter: Record<string, unknown>) => {
      _mockFindFilter = filter; // capture for assertion
      return employeeCountDocuments(filter);
    },
  },
}));

// ---------------------------------------------------------------------------

const { listEmployees } = await import("@/services/employeeService");

const baseQuery = { page: 1, limit: 20, branchId: undefined };

function agentUser(branchId: string): SessionUser {
  return {
    id: "useragent001",
    username: "agent01",
    name: "Agent One",
    role: "AGENT",
    branch: branchId,
    status: "ACTIVE",
  };
}

function hostUser(): SessionUser {
  return {
    id: "userhostxxx",
    username: "host01",
    name: "Host One",
    role: "HOST",
    branch: null,
    status: "ACTIVE",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _mockFindFilter = {};
  mockFindResult = [];
  mockCountResult = 0;
});

// ---------------------------------------------------------------------------

describe("listEmployees — AGENT branch scoping", () => {
  it("forces branch filter to user.branch, ignoring query.branchId", async () => {
    mockFindResult = [EMPLOYEES[0]];
    mockCountResult = 1;

    await listEmployees(agentUser(BRANCH_A._id), {
      ...baseQuery,
      // AGENT sends a different branch — must be silently ignored
      branchId: BRANCH_B._id,
    });

    // The filter passed to EmployeeModel.find() must use user.branch, not the
    // query param.
    expect(employeeFind).toHaveBeenCalledWith(
      expect.objectContaining({ branch: BRANCH_A._id }),
    );
    expect(employeeFind).not.toHaveBeenCalledWith(
      expect.objectContaining({ branch: BRANCH_B._id }),
    );
  });

  it("always applies employmentStatus: ACTIVE filter for AGENT", async () => {
    mockFindResult = [];
    mockCountResult = 0;

    await listEmployees(agentUser(BRANCH_A._id), baseQuery);

    expect(employeeFind).toHaveBeenCalledWith(
      expect.objectContaining({ employmentStatus: "ACTIVE" }),
    );
  });

  it("returns serialized employees with only allowed fields", async () => {
    mockFindResult = [EMPLOYEES[0]];
    mockCountResult = 1;

    const result = await listEmployees(agentUser(BRANCH_A._id), baseQuery);

    expect(result.employees).toHaveLength(1);
    const emp = result.employees[0];
    expect(emp._id).toBe(EMPLOYEES[0]._id);
    expect(emp.name).toBe("Budi Santoso");
    expect(emp.branch).toEqual({ _id: BRANCH_A._id, name: BRANCH_A.name });
    expect(emp.employmentStatus).toBe("ACTIVE");

    // Sensitive fields must NOT be present
    expect(emp).not.toHaveProperty("compensation");
    expect(emp).not.toHaveProperty("joinedAt");
    expect(emp).not.toHaveProperty("resignedAt");
  });

  it("returns pagination meta correctly", async () => {
    mockFindResult = [EMPLOYEES[0]];
    mockCountResult = 1;

    const result = await listEmployees(agentUser(BRANCH_A._id), {
      page: 1,
      limit: 20,
    });

    expect(result.pagination.total).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(20);
  });
});

// ---------------------------------------------------------------------------

describe("listEmployees — HOST branch scoping", () => {
  it("without branchId: no branch filter applied (all branches)", async () => {
    mockFindResult = EMPLOYEES;
    mockCountResult = 2;

    await listEmployees(hostUser(), baseQuery);

    // filter should NOT contain a branch key
    const callArg = employeeFind.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("branch");
  });

  it("with branchId: filters to that branch", async () => {
    mockFindResult = [EMPLOYEES[1]];
    mockCountResult = 1;

    await listEmployees(hostUser(), { ...baseQuery, branchId: BRANCH_B._id });

    expect(employeeFind).toHaveBeenCalledWith(
      expect.objectContaining({ branch: BRANCH_B._id }),
    );
  });

  it("always applies employmentStatus: ACTIVE filter for HOST too", async () => {
    mockFindResult = [];
    mockCountResult = 0;

    await listEmployees(hostUser(), baseQuery);

    expect(employeeFind).toHaveBeenCalledWith(
      expect.objectContaining({ employmentStatus: "ACTIVE" }),
    );
  });

  it("returns multiple employees across branches when no branchId", async () => {
    mockFindResult = EMPLOYEES;
    mockCountResult = 2;

    const result = await listEmployees(hostUser(), baseQuery);

    expect(result.employees).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe("listEmployees — serialization edge cases", () => {
  it("handles employee with null branch gracefully", async () => {
    mockFindResult = [{ ...EMPLOYEES[0], branch: null }];
    mockCountResult = 1;

    const result = await listEmployees(agentUser(BRANCH_A._id), baseQuery);

    expect(result.employees[0].branch).toBeNull();
  });

  it("handles employee with null user gracefully (name falls back to empty string)", async () => {
    mockFindResult = [{ ...EMPLOYEES[0], user: null }];
    mockCountResult = 1;

    const result = await listEmployees(agentUser(BRANCH_A._id), baseQuery);

    expect(result.employees[0].name).toBe("");
  });
});
