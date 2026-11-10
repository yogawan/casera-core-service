// @/validations/employeeSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

// PRD §7.3a — AGENT needs a list of employees at their branch as a dropdown
// option when creating a transaction (§8.3, Phase 13). This schema covers
// only the GET /employees query params; there is no create/update endpoint for
// employees here — that belongs to User Management (HOST only).
//
// Not .strict(): query strings legitimately carry unowned params (cache-busters
// etc.) — the same rationale as every other list-query schema in this file
// (see lib/pagination.ts comment on paginationQueryFields).
export const listEmployeesQuerySchema = z.object({
  ...paginationQueryFields,
  // HOST-only filter: silently ignored for AGENT in the service layer (§7.3a).
  branchId: z.string().optional(),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
