// @/validations/shavingSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

const revenueSharingSchema = z.object({
  ownerPercentage: z.number().min(0).max(100),
  employeePercentage: z.number().min(0).max(100),
});

const shavingFields = {
  name: z.string().trim().min(1).max(100),
  price: z.number().nonnegative(),
  // Optional — the model's own default (50/50, PRD §5.14) applies when
  // omitted. The model's pre("validate") hook enforces the pair sums to
  // 100 whenever it IS sent, so a partial override that would leave an
  // invalid split is rejected by construction (same pattern as Service).
  revenueSharing: revenueSharingSchema.optional(),
};

export const createShavingSchema = z.object(shavingFields).strict();
export type CreateShavingInput = z.infer<typeof createShavingSchema>;

export const updateShavingSchema = z.object(shavingFields).partial().strict();
export type UpdateShavingInput = z.infer<typeof updateShavingSchema>;

export const listShavingsQuerySchema = z.object({
  ...paginationQueryFields,
});
export type ListShavingsQuery = z.infer<typeof listShavingsQuerySchema>;
