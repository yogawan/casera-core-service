// @/services/employeeService.ts
//
// PRD §7.3a — GET /api/v1/employees.
//
// AGENT needs a dropdown list of employees at their branch when creating a
// transaction (§8.3, Phase 10/13). GET /users is HOST-only, so this service
// provides a narrower, branch-scoped, read-only view of Employee records for
// that specific purpose.
//
// Authorization contract (§7.3a):
//   AGENT  → branch forced to user.branch; branchId query param silently
//            ignored (not an error — consistent with how transaction and
//            inventory routes handle the same situation).
//   HOST   → branchId query param honoured; absence returns all branches.
//
// Field contract: only { _id, name, branch: { _id, name }, employmentStatus }
// are returned. Sensitive payroll fields (compensation.*, joinedAt, resignedAt)
// are never exposed. `name` comes from the populated User reference.

import type { SessionUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import EmployeeModel from "@/models/Employee";
import type { ListEmployeesQuery } from "@/validations/employeeSchema";

// Shape returned to callers — only the fields safe for the dropdown.
export interface EmployeeListItem {
  _id: string;
  name: string;
  branch: { _id: string; name: string } | null;
  employmentStatus: string;
}

function serializeEmployee(doc: {
  _id: unknown;
  user?: { name?: string } | null;
  branch?: { _id: unknown; name?: string } | null;
  employmentStatus?: string;
}): EmployeeListItem {
  const branchDoc = doc.branch as
    | { _id: unknown; name?: string }
    | null
    | undefined;

  return {
    _id: String(doc._id),
    // `user` is populated from the User document; `name` lives on User (§5.1).
    name: doc.user?.name ?? "",
    branch: branchDoc
      ? { _id: String(branchDoc._id), name: branchDoc.name ?? "" }
      : null,
    employmentStatus: doc.employmentStatus ?? "ACTIVE",
  };
}

export async function listEmployees(
  user: SessionUser,
  query: ListEmployeesQuery,
) {
  await connectDB();

  // Build the branch filter according to the authorization contract (§7.3a).
  // AGENT: always their own branch, regardless of what query.branchId says.
  // HOST: use query.branchId when provided, otherwise no branch filter.
  const branchFilter: Record<string, unknown> =
    user.role === "AGENT"
      ? // user.branch is guaranteed non-null for AGENT (§5.1 / §3.3).
        { branch: user.branch }
      : query.branchId
        ? { branch: query.branchId }
        : {};

  // Only ACTIVE employees appear in the dropdown — AGENT must not be able to
  // attribute employeeRevenue to a resigned or suspended employee (§5.5, §7.3a
  // "Filtering Default"). This filter is applied server-side and cannot be
  // overridden by the client.
  const baseFilter = { employmentStatus: "ACTIVE", ...branchFilter };

  const findQuery = EmployeeModel.find(baseFilter)
    .populate("user", "name") // only need name from User (§7.3a response shape)
    .populate("branch", "name") // only need name from Branch
    .select("_id user branch employmentStatus") // drop compensation/joinedAt/resignedAt
    .sort(stableSort({ _id: 1 }))
    .skip(paginationSkip(query))
    .limit(query.limit)
    .lean();

  const countQuery = EmployeeModel.countDocuments(baseFilter);

  const { items, pagination } = await paginateQueries(
    findQuery as unknown as Promise<
      {
        _id: unknown;
        user?: { name?: string } | null;
        branch?: { _id: unknown; name?: string } | null;
        employmentStatus?: string;
      }[]
    >,
    countQuery,
    query,
  );

  return {
    employees: items.map(serializeEmployee),
    pagination,
  };
}
