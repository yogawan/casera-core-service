// @/services/colouringService.ts
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import ColouringModel from "@/models/Colouring";
import type {
  CreateColouringInput,
  ListColouringsQuery,
  UpdateColouringInput,
} from "@/validations/colouringSchema";

export async function createColouring(input: CreateColouringInput) {
  await connectDB();
  // revenueSharing-sums-to-100 is enforced by the model's own pre-validate
  // hook; a violation surfaces as a clean 400 via handleApiError's mongoose
  // ValidationError handling, not a raw 500.
  return ColouringModel.create(input);
}

// PRD §5.14: this model has no isActive field, so HOST and AGENT both see
// the full catalog — there is no inactive subset to hide (unlike Service).
export async function listColourings(query: ListColouringsQuery) {
  await connectDB();

  return paginateQueries(
    ColouringModel.find({})
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    ColouringModel.countDocuments({}),
    query,
  );
}

export async function getColouringById(id: string) {
  await connectDB();
  const colouring = await ColouringModel.findById(id);

  if (!colouring) {
    throw Errors.notFound("Colouring not found.");
  }

  return colouring;
}

export async function updateColouring(id: string, input: UpdateColouringInput) {
  await connectDB();
  const colouring = await ColouringModel.findById(id);

  if (!colouring) {
    throw Errors.notFound("Colouring not found.");
  }

  if (input.name !== undefined) colouring.name = input.name;
  if (input.price !== undefined) colouring.price = input.price;
  if (input.revenueSharing !== undefined) {
    colouring.revenueSharing = input.revenueSharing;
  }

  await colouring.save();
  return colouring;
}
