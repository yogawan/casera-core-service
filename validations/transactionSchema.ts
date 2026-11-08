// @/validations/transactionSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

// §8.3: the backend never trusts agentId, branchId, total, ownerRevenue,
// employeeRevenue, or any *Snapshot from the client — they simply have no
// field here, and .strict() turns any attempt to send them into a 400
// instead of a silently-ignored no-op.
export const createTransactionSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),
    // PRD §5.14: Service (single required serviceId) is replaced by five
    // independent optional category ids — a transaction fills 1 to 5 of
    // these at once, never more than one per category (not an array). The
    // .refine() below requires at least one, mirroring the model's own
    // pre("validate") hook.
    haircutId: z.string().trim().min(1).optional(),
    shavingId: z.string().trim().min(1).optional(),
    treatmentId: z.string().trim().min(1).optional(),
    colouringId: z.string().trim().min(1).optional(),
    chemicalId: z.string().trim().min(1).optional(),
    // §5.5/§5.13/§8.3: deliberately NOT optional and NOT derived from the
    // session, unlike agentId/branchId — the backend has no other way to
    // know who performed the service except the AGENT picking them manually.
    employeeId: z.string().trim().min(1),
    paymentMethod: z.enum(["CASH", "QRIS"]),
    discountAmount: z.number().nonnegative().optional().default(0),
    serviceHourType: z
      .enum(["REGULAR", "OVERTIME"])
      .optional()
      .default("REGULAR"),
  })
  .strict()
  .refine(
    (data) =>
      Boolean(
        data.haircutId ||
          data.shavingId ||
          data.treatmentId ||
          data.colouringId ||
          data.chemicalId,
      ),
    {
      message:
        "At least one of haircutId, shavingId, treatmentId, colouringId, chemicalId is required.",
    },
  );
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  ...paginationQueryFields,
  search: z.string().trim().min(1).optional(),
  paymentStatus: z
    .enum(["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"])
    .optional(),
  transactionStatus: z
    .enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
