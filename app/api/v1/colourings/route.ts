// @/app/api/v1/colourings/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createColouring, listColourings } from "@/services/colouringService";
import {
  createColouringSchema,
  listColouringsQuerySchema,
} from "@/validations/colouringSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_AGENT",
  });
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listColouringsQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listColourings(parsedQuery.data);
  return successResponse({
    colourings: result.items,
    pagination: result.pagination,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST"]);

  const parsed = createColouringSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const colouring = await createColouring(parsed.data);
  return successResponse({ colouring }, 201);
});
