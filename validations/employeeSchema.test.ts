// @/validations/employeeSchema.test.ts
//
// PRD §7.3a / Phase 13 — listEmployeesQuerySchema tests.
// Tests mirror the pattern from other list-query schema tests in this file
// (e.g. dashboardSchema.test.ts, transactionSchema.test.ts).

import { describe, expect, it } from "vitest";
import { listEmployeesQuerySchema } from "./employeeSchema";

describe("listEmployeesQuerySchema", () => {
  it("accepts empty query and applies defaults", () => {
    const result = listEmployeesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
    expect(result.data.branchId).toBeUndefined();
  });

  it("accepts branchId when provided", () => {
    const result = listEmployeesQuerySchema.safeParse({
      branchId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.branchId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("accepts explicit page and limit", () => {
    const result = listEmployeesQuerySchema.safeParse({
      page: "2",
      limit: "10",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(2);
    expect(result.data.limit).toBe(10);
  });

  it("coerces string numbers to integers", () => {
    const result = listEmployeesQuerySchema.safeParse({
      page: "3",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(3);
    expect(result.data.limit).toBe(50);
  });

  it("rejects limit > 100", () => {
    const result = listEmployeesQuerySchema.safeParse({ limit: "101" });
    expect(result.success).toBe(false);
  });

  it("rejects limit = 0", () => {
    const result = listEmployeesQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects page = 0", () => {
    const result = listEmployeesQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("accepts limit = 100 (boundary)", () => {
    const result = listEmployeesQuerySchema.safeParse({ limit: "100" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.limit).toBe(100);
  });

  it("passes through unknown query params (not strict — cache-busters etc.)", () => {
    // listEmployeesQuerySchema is intentionally NOT .strict() — same rationale
    // as all other list-query schemas. Unknown params must not cause rejection.
    const result = listEmployeesQuerySchema.safeParse({
      _cb: "12345",
      utm_source: "mobile",
    });
    expect(result.success).toBe(true);
  });
});
