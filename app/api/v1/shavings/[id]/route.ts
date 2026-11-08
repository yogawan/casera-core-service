// @/app/api/v1/shavings/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getShavingById, updateShaving } from "@/services/shavingService";
import { updateShavingSchema } from "@/validations/shavingSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, {
      subscriptionPolicy: "EXEMPT_AGENT",
    });
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const shaving = await getShavingById(id);
    return successResponse({ shaving });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateShavingSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const shaving = await updateShaving(id, parsed.data);
    return successResponse({ shaving });
  },
);
