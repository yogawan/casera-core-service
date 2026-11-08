// @/validations/chemicalSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

const revenueSharingSchema = z.object({
  ownerPercentage: z.number().min(0).max(100),
  employeePercentage: z.number().min(0).max(100),
});

const chemicalFields = {
  name: z.string().trim().min(1).max(100),
  price: z.number().nonnegative(),
  // Optional — the model's own default (60/40, PRD §5.14) applies when
  // omitted. The model's pre("validate") hook enforces the pair sums to
  // 100 whenever it IS sent, so a partial override that would leave an
  // invalid split is rejected by construction (same pattern as Service).
  revenueSharing: revenueSharingSchema.optional(),
};

export const createChemicalSchema = z.object(chemicalFields).strict();
export type CreateChemicalInput = z.infer<typeof createChemicalSchema>;

export const updateChemicalSchema = z.object(chemicalFields).partial().strict();
export type UpdateChemicalInput = z.infer<typeof updateChemicalSchema>;

export const listChemicalsQuerySchema = z.object({
  ...paginationQueryFields,
});
export type ListChemicalsQuery = z.infer<typeof listChemicalsQuerySchema>;
