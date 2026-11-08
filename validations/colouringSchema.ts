// @/validations/colouringSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

const revenueSharingSchema = z.object({
  ownerPercentage: z.number().min(0).max(100),
  employeePercentage: z.number().min(0).max(100),
});

const colouringFields = {
  name: z.string().trim().min(1).max(100),
  price: z.number().nonnegative(),
  // Optional — the model's own default (60/40, PRD §5.14) applies when
  // omitted. The model's pre("validate") hook enforces the pair sums to
  // 100 whenever it IS sent, so a partial override that would leave an
  // invalid split is rejected by construction (same pattern as Service).
  revenueSharing: revenueSharingSchema.optional(),
};

export const createColouringSchema = z.object(colouringFields).strict();
export type CreateColouringInput = z.infer<typeof createColouringSchema>;

export const updateColouringSchema = z
  .object(colouringFields)
  .partial()
  .strict();
export type UpdateColouringInput = z.infer<typeof updateColouringSchema>;

export const listColouringsQuerySchema = z.object({
  ...paginationQueryFields,
});
export type ListColouringsQuery = z.infer<typeof listColouringsQuerySchema>;
