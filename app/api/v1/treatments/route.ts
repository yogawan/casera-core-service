// @/app/api/v1/treatments/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createTreatment, listTreatments } from "@/services/treatmentService";
import {
  createTreatmentSchema,
  listTreatmentsQuerySchema,
} from "@/validations/treatmentSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_AGENT",
  });
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listTreatmentsQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listTreatments(parsedQuery.data);
  return successResponse({
    treatments: result.items,
    pagination: result.pagination,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST"]);

  const parsed = createTreatmentSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const treatment = await createTreatment(parsed.data);
  return successResponse({ treatment }, 201);
});
