// @/app/api/v1/haircuts/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getHaircutById, updateHaircut } from "@/services/haircutService";
import { updateHaircutSchema } from "@/validations/haircutSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, {
      subscriptionPolicy: "EXEMPT_AGENT",
    });
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const haircut = await getHaircutById(id);
    return successResponse({ haircut });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateHaircutSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const haircut = await updateHaircut(id, parsed.data);
    return successResponse({ haircut });
  },
);
