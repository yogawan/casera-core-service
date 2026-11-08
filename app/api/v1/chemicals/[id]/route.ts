// @/app/api/v1/chemicals/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getChemicalById, updateChemical } from "@/services/chemicalService";
import { updateChemicalSchema } from "@/validations/chemicalSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, {
      subscriptionPolicy: "EXEMPT_AGENT",
    });
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const chemical = await getChemicalById(id);
    return successResponse({ chemical });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateChemicalSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const chemical = await updateChemical(id, parsed.data);
    return successResponse({ chemical });
  },
);
