// @/app/scalar/docs/paths/employees.ts
//
// PRD §7.3a — GET /api/v1/employees
// Employee listing for transaction dropdown (Phase 13, PLAN-GROOMA.md).
//
// Authorization diverges by role on the SAME endpoint:
//   AGENT → branch forced to their session branch; branchId query param ignored.
//   HOST  → branchId filters to one branch; absent = all branches.
//
// subscriptionPolicy: EXEMPT_AGENT (§23.4.1) — AGENT can call this even when
// HOST's subscription is lapsed, since picking an employee is part of creating
// a transaction for a customer already in the chair.

export const employeePaths = {
  "/api/v1/employees": {
    get: {
      tags: ["Employees"],
      operationId: "listEmployees",
      summary:
        "List active employees for transaction dropdown (HOST/AGENT, branch-scoped)",
      description: [
        "Returns employees with `employmentStatus: ACTIVE` only. Used by AGENT to populate the employee dropdown when creating a transaction (§8.3).",
        "",
        "**AGENT** — always scoped to their assigned branch; `branchId` query param is silently ignored.",
        "**HOST** — `branchId` filters to one branch; omitting it returns employees from all branches.",
        "",
        "Response fields are limited to what is needed for the dropdown (`_id`, `name`, `branch`, `employmentStatus`). Payroll fields (`compensation.*`, `joinedAt`, `resignedAt`) are never included.",
        "",
        "Subscription policy: `EXEMPT_AGENT` (§23.4.1) — AGENT can call this endpoint even while HOST subscription is lapsed.",
      ].join("\n"),
      parameters: [
        {
          name: "branchId",
          in: "query",
          required: false,
          schema: { type: "string" },
          description:
            "HOST only — filter by branch ObjectId. Silently ignored for AGENT (session branch is always used instead).",
        },
        {
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, default: 1 },
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        "200": {
          description: "List of active employees",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      employees: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/EmployeeListItem",
                        },
                      },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                    required: ["employees", "pagination"],
                  },
                },
              },
            },
          },
        },
        "400": { description: "page or limit out of range" },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST or AGENT" },
      },
    },
  },
};
