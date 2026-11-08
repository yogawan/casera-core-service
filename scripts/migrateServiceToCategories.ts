#!/usr/bin/env node

/**
 * Service → Category Collections Migration Script
 *
 * PRD §5.14 / PLAN-GROOMA.md Phase 11: Service (single catalog) has been
 * replaced by five category collections — Haircut, Shaving, Treatment,
 * Colouring, Chemical — and models/Service.ts itself was deleted once
 * every reader migrated off it. This script creates one document per
 * existing `services` collection document in whichever target collection
 * its `category` field names (case-insensitive exact match), carrying over
 * name/price/revenueSharing.
 *
 * Does NOT touch or delete the source `services` collection. "Nasib
 * dokumen Service yang sudah ada" (PRD §5.14) was explicitly left
 * undecided beyond "the mapping is by category" — this script only ever
 * adds to the five target collections. What happens to the old `services`
 * collection afterward (archive, drop, leave it) is a separate decision,
 * not made here.
 *
 * A document whose `category` doesn't case-insensitively match exactly
 * one of Haircut/Shaving/Treatment/Colouring/Chemical (including an
 * empty/missing category) is reported as unmapped and skipped — never
 * guessed.
 *
 * Idempotency: since none of the five target models have a unique
 * business key (no serviceCode-equivalent), a document is treated as
 * already migrated if a document with the exact same `name` already
 * exists in its target collection. This is a heuristic, not a guarantee —
 * two distinct source documents that happen to share a name in the same
 * target category would only migrate once. Acceptable for a one-time
 * migration; revisit if that collision actually occurs.
 *
 * Reads the `services` collection through a local, script-only Mongoose
 * model (registered under a name that isn't "Service") rather than
 * reintroducing models/Service.ts — that file was deleted on purpose, and
 * a one-time migration script is not a reason to bring it back.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrateServiceToCategories.ts [--fix]
 *
 * Options:
 *   --fix   Apply the migration (default: dry-run, only report)
 */

import mongoose, { Schema } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import ChemicalModel from "@/models/Chemical";
import ColouringModel from "@/models/Colouring";
import HaircutModel from "@/models/Haircut";
import ShavingModel from "@/models/Shaving";
import TreatmentModel from "@/models/Treatment";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable");
}

const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");

// Read-only view of the (model-deleted) `services` collection, registered
// under a name distinct from "Service" so it can never collide with
// anything else in the model registry.
const LegacyServiceSchema = new Schema(
  {
    name: String,
    category: String,
    price: Number,
    revenueSharing: {
      ownerPercentage: Number,
      employeePercentage: Number,
    },
  },
  { strict: false, versionKey: false },
);
const LegacyServiceModel = mongoose.model(
  "MigrationLegacyService",
  LegacyServiceSchema,
  "services",
);

const CATEGORY_TARGETS = [
  { match: "haircut", model: HaircutModel, label: "Haircut" },
  { match: "shaving", model: ShavingModel, label: "Shaving" },
  { match: "treatment", model: TreatmentModel, label: "Treatment" },
  { match: "colouring", model: ColouringModel, label: "Colouring" },
  { match: "chemical", model: ChemicalModel, label: "Chemical" },
] as const;

interface MigrationResult {
  total: number;
  migrated: number;
  skippedExisting: number;
  unmapped: Array<{ id: string; name: string; category: string | null }>;
}

async function migrateServiceToCategories(): Promise<MigrationResult> {
  await connectDB();

  const services = await LegacyServiceModel.find({}).lean();

  const result: MigrationResult = {
    total: services.length,
    migrated: 0,
    skippedExisting: 0,
    unmapped: [],
  };

  for (const service of services) {
    const normalizedCategory =
      typeof service.category === "string"
        ? service.category.trim().toLowerCase()
        : undefined;
    const target = CATEGORY_TARGETS.find(
      (candidate) => candidate.match === normalizedCategory,
    );

    if (!target) {
      result.unmapped.push({
        id: String(service._id),
        name: String(service.name ?? ""),
        category:
          typeof service.category === "string" ? service.category : null,
      });
      continue;
    }

    const existing = await target.model.findOne({ name: service.name });
    if (existing) {
      result.skippedExisting += 1;
      console.log(
        `[${target.label}] Skipped "${service.name}": a document with this name already exists in the target collection.`,
      );
      continue;
    }

    if (shouldFix) {
      const created = await target.model.create({
        name: service.name,
        price: service.price,
        revenueSharing: service.revenueSharing,
      });
      console.log(
        `[${target.label}] Migrated "${service.name}" (Service ${service._id} -> ${target.label} ${created._id}).`,
      );
    } else {
      console.log(
        `[${target.label}] Would migrate "${service.name}" (Service ${service._id}). Dry-run -- rerun with --fix to apply.`,
      );
    }
    result.migrated += 1;
  }

  return result;
}

migrateServiceToCategories()
  .then(async (result) => {
    console.log(
      `\nDone${shouldFix ? "" : " (dry-run)"}. ${result.total} Service document(s) considered: ` +
        `${result.migrated} ${shouldFix ? "migrated" : "would migrate"}, ` +
        `${result.skippedExisting} skipped (already present by name), ` +
        `${result.unmapped.length} unmapped.`,
    );
    if (result.unmapped.length > 0) {
      console.log(
        "\nUnmapped Service documents (category did not match Haircut/Shaving/Treatment/Colouring/Chemical):",
      );
      for (const entry of result.unmapped) {
        console.log(
          `  - ${entry.id} "${entry.name}" (category: ${entry.category ?? "<none>"})`,
        );
      }
    }
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(
      "Migration failed:",
      error instanceof Error ? error.message : String(error),
    );
    await mongoose.disconnect();
    process.exit(1);
  });
