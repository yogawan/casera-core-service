// @/validations/treatmentSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

const revenueSharingSchema = z.object({
  ownerPercentage: z.number().min(0).max(100),
  employeePercentage: z.number().min(0).max(100),
});

const treatmentFields = {
  name: z.string().trim().min(1).max(100),
  price: z.number().nonnegative(),
  // Optional — the model's own default (50/50, PRD §5.14) applies when
  // omitted. The model's pre("validate") hook enforces the pair sums to
  // 100 whenever it IS sent, so a partial override that would leave an
  // invalid split is rejected by construction (same pattern as Service).
  revenueSharing: revenueSharingSchema.optional(),
};

export const createTreatmentSchema = z.object(treatmentFields).strict();
export type CreateTreatmentInput = z.infer<typeof createTreatmentSchema>;

export const updateTreatmentSchema = z
  .object(treatmentFields)
  .partial()
  .strict();
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentSchema>;

export const listTreatmentsQuerySchema = z.object({
  ...paginationQueryFields,
});
export type ListTreatmentsQuery = z.infer<typeof listTreatmentsQuerySchema>;
