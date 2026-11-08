// @/app/api/v1/treatments/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getTreatmentById, updateTreatment } from "@/services/treatmentService";
import { updateTreatmentSchema } from "@/validations/treatmentSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, {
      subscriptionPolicy: "EXEMPT_AGENT",
    });
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const treatment = await getTreatmentById(id);
    return successResponse({ treatment });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateTreatmentSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const treatment = await updateTreatment(id, parsed.data);
    return successResponse({ treatment });
  },
);
