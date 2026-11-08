// @/services/treatmentService.ts
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import TreatmentModel from "@/models/Treatment";
import type {
  CreateTreatmentInput,
  ListTreatmentsQuery,
  UpdateTreatmentInput,
} from "@/validations/treatmentSchema";

export async function createTreatment(input: CreateTreatmentInput) {
  await connectDB();
  // revenueSharing-sums-to-100 is enforced by the model's own pre-validate
  // hook; a violation surfaces as a clean 400 via handleApiError's mongoose
  // ValidationError handling, not a raw 500.
  return TreatmentModel.create(input);
}

// PRD §5.14: this model has no isActive field, so HOST and AGENT both see
// the full catalog — there is no inactive subset to hide (unlike Service).
export async function listTreatments(query: ListTreatmentsQuery) {
  await connectDB();

  return paginateQueries(
    TreatmentModel.find({})
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    TreatmentModel.countDocuments({}),
    query,
  );
}

export async function getTreatmentById(id: string) {
  await connectDB();
  const treatment = await TreatmentModel.findById(id);

  if (!treatment) {
    throw Errors.notFound("Treatment not found.");
  }

  return treatment;
}

export async function updateTreatment(id: string, input: UpdateTreatmentInput) {
  await connectDB();
  const treatment = await TreatmentModel.findById(id);

  if (!treatment) {
    throw Errors.notFound("Treatment not found.");
  }

  if (input.name !== undefined) treatment.name = input.name;
  if (input.price !== undefined) treatment.price = input.price;
  if (input.revenueSharing !== undefined) {
    treatment.revenueSharing = input.revenueSharing;
  }

  await treatment.save();
  return treatment;
}
