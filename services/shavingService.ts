// @/services/shavingService.ts
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import ShavingModel from "@/models/Shaving";
import type {
  CreateShavingInput,
  ListShavingsQuery,
  UpdateShavingInput,
} from "@/validations/shavingSchema";

export async function createShaving(input: CreateShavingInput) {
  await connectDB();
  // revenueSharing-sums-to-100 is enforced by the model's own pre-validate
  // hook; a violation surfaces as a clean 400 via handleApiError's mongoose
  // ValidationError handling, not a raw 500.
  return ShavingModel.create(input);
}

// PRD §5.14: this model has no isActive field, so HOST and AGENT both see
// the full catalog — there is no inactive subset to hide (unlike Service).
export async function listShavings(query: ListShavingsQuery) {
  await connectDB();

  return paginateQueries(
    ShavingModel.find({})
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    ShavingModel.countDocuments({}),
    query,
  );
}

export async function getShavingById(id: string) {
  await connectDB();
  const shaving = await ShavingModel.findById(id);

  if (!shaving) {
    throw Errors.notFound("Shaving not found.");
  }

  return shaving;
}

export async function updateShaving(id: string, input: UpdateShavingInput) {
  await connectDB();
  const shaving = await ShavingModel.findById(id);

  if (!shaving) {
    throw Errors.notFound("Shaving not found.");
  }

  if (input.name !== undefined) shaving.name = input.name;
  if (input.price !== undefined) shaving.price = input.price;
  if (input.revenueSharing !== undefined) {
    shaving.revenueSharing = input.revenueSharing;
  }

  await shaving.save();
  return shaving;
}
