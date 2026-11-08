// @/app/api/v1/colourings/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getColouringById, updateColouring } from "@/services/colouringService";
import { updateColouringSchema } from "@/validations/colouringSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, {
      subscriptionPolicy: "EXEMPT_AGENT",
    });
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const colouring = await getColouringById(id);
    return successResponse({ colouring });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateColouringSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const colouring = await updateColouring(id, parsed.data);
    return successResponse({ colouring });
  },
);
