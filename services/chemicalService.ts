// @/services/chemicalService.ts
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import ChemicalModel from "@/models/Chemical";
import type {
  CreateChemicalInput,
  ListChemicalsQuery,
  UpdateChemicalInput,
} from "@/validations/chemicalSchema";

export async function createChemical(input: CreateChemicalInput) {
  await connectDB();
  // revenueSharing-sums-to-100 is enforced by the model's own pre-validate
  // hook; a violation surfaces as a clean 400 via handleApiError's mongoose
  // ValidationError handling, not a raw 500.
  return ChemicalModel.create(input);
}

// PRD §5.14: this model has no isActive field, so HOST and AGENT both see
// the full catalog — there is no inactive subset to hide (unlike Service).
export async function listChemicals(query: ListChemicalsQuery) {
  await connectDB();

  return paginateQueries(
    ChemicalModel.find({})
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    ChemicalModel.countDocuments({}),
    query,
  );
}

export async function getChemicalById(id: string) {
  await connectDB();
  const chemical = await ChemicalModel.findById(id);

  if (!chemical) {
    throw Errors.notFound("Chemical not found.");
  }

  return chemical;
}

export async function updateChemical(id: string, input: UpdateChemicalInput) {
  await connectDB();
  const chemical = await ChemicalModel.findById(id);

  if (!chemical) {
    throw Errors.notFound("Chemical not found.");
  }

  if (input.name !== undefined) chemical.name = input.name;
  if (input.price !== undefined) chemical.price = input.price;
  if (input.revenueSharing !== undefined) {
    chemical.revenueSharing = input.revenueSharing;
  }

  await chemical.save();
  return chemical;
}
