// @/validations/customerSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

// Narrowed per PRD §5.3 (2026-11-08): customerCode/email/gender/birthDate/
// address/customerType/lastVisitAt no longer exist on the model at all —
// not deferred, removed. loyaltyPoints is still deliberately absent from
// every schema below: it may only change through an auditable transaction
// mechanism, never a direct profile edit (§5.3). .strict() turns any
// attempt to sneak it (or a removed field) in into a clean 400 instead of
// a silent no-op.
const customerFields = {
  name: z.string().trim().min(1).max(100),
  cityFrom: z.string().trim().max(100).optional(),
  age: z.number().int().nonnegative().optional(),
  // Free text — confirmed via user decision as descriptive, not an
  // enum/number/boolean (§5.3 "Belum diputuskan" was resolved this way).
  busyness: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(32).optional(),
};

export const createCustomerSchema = z.object(customerFields).strict();
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object(customerFields).partial().strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const setCustomerStatusSchema = z
  .object({ isActive: z.boolean() })
  .strict();
export type SetCustomerStatusInput = z.infer<typeof setCustomerStatusSchema>;

// `search` was previously read straight off searchParams with no validation
// at all. It is bounded here for the same reason every other free-text field
// is: the value reaches a $regex (escaped, so not an injection vector, but an
// unbounded pattern is still work the server performs on request).
//
// Empty and whitespace-only values normalize to undefined instead of failing
// .min(1). That preserves this endpoint's existing behavior exactly — a
// cleared search box sending ?search= used to mean "no filter", and turning
// that into a 400 would break the POS customer lookup. Note that /inventory
// and /transactions do reject an empty ?search=; that difference predates
// this change and is left as-is rather than altering their contract here.
export const listCustomersQuerySchema = z.object({
  ...paginationQueryFields,
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value ? value : undefined)),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
