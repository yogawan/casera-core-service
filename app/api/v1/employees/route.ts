// @/app/api/v1/employees/route.ts
//
// PRD §7.3a — GET /api/v1/employees
//
// Branch-scoped employee listing for transaction dropdown (Phase 13).
// AGENT: restricted to their own branch; subscriptionPolicy EXEMPT_AGENT so
//        the POS flow stays open even when the HOST's subscription lapses
//        (§23.4.1 — GET /api/v1/employees is on the allowlist).
// HOST:  can filter by branchId or see all branches; standard ENFORCED policy.
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { listEmployees } from "@/services/employeeService";
import { listEmployeesQuerySchema } from "@/validations/employeeSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  // EXEMPT_AGENT: AGENT can always reach this endpoint even when the HOST's
  // subscription is lapsed — it is part of the POS flow needed to pick the
  // employee for a transaction (§23.4.1). HOST is still ENFORCED.
  const user = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_AGENT",
  });
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listEmployeesQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listEmployees(user, parsedQuery.data);
  return successResponse({
    employees: result.employees,
    pagination: result.pagination,
  });
});
