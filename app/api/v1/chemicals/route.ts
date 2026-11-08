// @/app/api/v1/chemicals/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createChemical, listChemicals } from "@/services/chemicalService";
import {
  createChemicalSchema,
  listChemicalsQuerySchema,
} from "@/validations/chemicalSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_AGENT",
  });
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listChemicalsQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listChemicals(parsedQuery.data);
  return successResponse({
    chemicals: result.items,
    pagination: result.pagination,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST"]);

  const parsed = createChemicalSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const chemical = await createChemical(parsed.data);
  return successResponse({ chemical }, 201);
});
