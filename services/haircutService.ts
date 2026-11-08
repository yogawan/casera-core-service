// @/services/haircutService.ts
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import HaircutModel from "@/models/Haircut";
import type {
  CreateHaircutInput,
  ListHaircutsQuery,
  UpdateHaircutInput,
} from "@/validations/haircutSchema";

export async function createHaircut(input: CreateHaircutInput) {
  await connectDB();
  // revenueSharing-sums-to-100 is enforced by the model's own pre-validate
  // hook; a violation surfaces as a clean 400 via handleApiError's mongoose
  // ValidationError handling, not a raw 500.
  return HaircutModel.create(input);
}

// PRD §5.14: this model has no isActive field, so HOST and AGENT both see
// the full catalog — there is no inactive subset to hide (unlike Service).
export async function listHaircuts(query: ListHaircutsQuery) {
  await connectDB();

  return paginateQueries(
    HaircutModel.find({})
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    HaircutModel.countDocuments({}),
    query,
  );
}

export async function getHaircutById(id: string) {
  await connectDB();
  const haircut = await HaircutModel.findById(id);

  if (!haircut) {
    throw Errors.notFound("Haircut not found.");
  }

  return haircut;
}

export async function updateHaircut(id: string, input: UpdateHaircutInput) {
  await connectDB();
  const haircut = await HaircutModel.findById(id);

  if (!haircut) {
    throw Errors.notFound("Haircut not found.");
  }

  if (input.name !== undefined) haircut.name = input.name;
  if (input.price !== undefined) haircut.price = input.price;
  if (input.revenueSharing !== undefined) {
    haircut.revenueSharing = input.revenueSharing;
  }

  await haircut.save();
  return haircut;
}
