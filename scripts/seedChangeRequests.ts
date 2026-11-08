// @/scripts/seedChangeRequests.ts
//
// Seeds a handful of PENDING transaction change requests ("pengajuan
// perubahan data transaksi", PRD §5.8) onto existing Transaction documents,
// so the review queue (GET /transaction-change-requests) and the
// approve/reject endpoints have real data to exercise. Writes
// transaction.changeRequest directly rather than going through
// services/approvalService.ts's submitChangeRequest() — that function
// requires an authenticated HTTP session — but mirrors its shape exactly
// (same full-replacement assignment, same fields).
//
// Only touches transactions that are not CANCELLED and currently have
// changeRequest.status "NONE" — never overwrites an existing request, so
// re-running this script just tops up a fresh batch instead of duplicating
// or clobbering state. requestedBy is always the transaction's own agent,
// matching who would realistically submit a correction on their own sale.
//
// Optional env: SEED_CHANGE_REQUEST_COUNT (default 5) — how many eligible
// transactions to seed a request onto.
//
// Usage (reads .env.local automatically):
//   npm run seed:change-requests

import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import ChemicalModel from "@/models/Chemical";
import ColouringModel from "@/models/Colouring";
import HaircutModel from "@/models/Haircut";
import ShavingModel from "@/models/Shaving";
import TransactionModel from "@/models/Transaction";
import TreatmentModel from "@/models/Treatment";

const DEFAULT_COUNT = 5;

interface BuiltChange {
  reason: string;
  requestedChanges: Record<string, unknown>;
}

type TransactionDoc = InstanceType<typeof TransactionModel>;

interface CategoryDoc {
  _id: unknown;
  name: string;
}

// PRD §5.14: Service (single catalog) is replaced by five independent
// category collections — each archetype below that proposes "pick a
// different one" needs its own catalog to pick an alternative from.
interface CategoryCatalog {
  haircut: CategoryDoc[];
  shaving: CategoryDoc[];
  treatment: CategoryDoc[];
  colouring: CategoryDoc[];
  chemical: CategoryDoc[];
}

interface Archetype {
  name: string;
  build: (
    transaction: TransactionDoc,
    catalog: CategoryCatalog,
  ) => BuiltChange | null;
}

// Each archetype returns null when it doesn't apply to a given
// transaction's current state (e.g. a category-swap archetype has nothing
// to offer if the transaction never had that category, or no alternative
// exists in that category's collection) — the caller falls back to the
// next one in rotation.
const archetypes: Archetype[] = [
  {
    name: "discountAmount",
    build: (transaction) => {
      // subtotal (not a single category's snapshot price) is the right
      // basis now that a transaction may combine more than one category —
      // it's the one pre-discount figure guaranteed to exist regardless of
      // how many categories are filled.
      const price = transaction.subtotal;
      const current = transaction.discountAmount;
      const next = current === 0 ? Math.round(price * 0.1) : 0;
      if (next === current) return null;

      return {
        reason:
          next > current
            ? "Pelanggan ini member yang berhak mendapat potongan harga, tapi belum dimasukkan saat transaksi dibuat."
            : "Potongan harga yang tercatat salah, seharusnya pelanggan tidak mendapat diskon untuk layanan ini.",
        requestedChanges: { discountAmount: next },
      };
    },
  },
  {
    name: "serviceHourType",
    build: (transaction) => {
      const next =
        transaction.serviceHourType === "REGULAR" ? "OVERTIME" : "REGULAR";

      return {
        reason:
          next === "OVERTIME"
            ? "Layanan ini dikerjakan di luar jam operasional normal, seharusnya dihitung sebagai jam lembur."
            : "Jam layanan salah tercatat sebagai lembur, seharusnya jam reguler biasa.",
        requestedChanges: { serviceHourType: next },
      };
    },
  },
  {
    name: "customerId",
    build: (transaction) => {
      if (!transaction.customer) return null;

      return {
        reason:
          "Salah input data pelanggan saat transaksi, pelanggan sebenarnya datang tanpa mendaftarkan data member.",
        requestedChanges: { customerId: null },
      };
    },
  },
  {
    name: "haircutId",
    build: (transaction, catalog) => {
      if (!transaction.haircut) return null;
      const currentId = String(transaction.haircut);
      const alternative = catalog.haircut.find(
        (doc) => String(doc._id) !== currentId,
      );
      if (!alternative) return null;

      return {
        reason: `Salah pilih jenis haircut saat transaksi dibuat, pelanggan sebenarnya memilih "${alternative.name}" bukan "${transaction.haircutSnapshot.name}".`,
        requestedChanges: { haircutId: String(alternative._id) },
      };
    },
  },
  {
    name: "shavingId",
    build: (transaction, catalog) => {
      if (!transaction.shaving) return null;
      const currentId = String(transaction.shaving);
      const alternative = catalog.shaving.find(
        (doc) => String(doc._id) !== currentId,
      );
      if (!alternative) return null;

      return {
        reason: `Salah pilih jenis shaving saat transaksi dibuat, pelanggan sebenarnya memilih "${alternative.name}" bukan "${transaction.shavingSnapshot.name}".`,
        requestedChanges: { shavingId: String(alternative._id) },
      };
    },
  },
  {
    name: "treatmentId",
    build: (transaction, catalog) => {
      if (!transaction.treatment) return null;
      const currentId = String(transaction.treatment);
      const alternative = catalog.treatment.find(
        (doc) => String(doc._id) !== currentId,
      );
      if (!alternative) return null;

      return {
        reason: `Salah pilih jenis treatment saat transaksi dibuat, pelanggan sebenarnya memilih "${alternative.name}" bukan "${transaction.treatmentSnapshot.name}".`,
        requestedChanges: { treatmentId: String(alternative._id) },
      };
    },
  },
  {
    name: "colouringId",
    build: (transaction, catalog) => {
      if (!transaction.colouring) return null;
      const currentId = String(transaction.colouring);
      const alternative = catalog.colouring.find(
        (doc) => String(doc._id) !== currentId,
      );
      if (!alternative) return null;

      return {
        reason: `Salah pilih jenis colouring saat transaksi dibuat, pelanggan sebenarnya memilih "${alternative.name}" bukan "${transaction.colouringSnapshot.name}".`,
        requestedChanges: { colouringId: String(alternative._id) },
      };
    },
  },
  {
    name: "chemicalId",
    build: (transaction, catalog) => {
      if (!transaction.chemical) return null;
      const currentId = String(transaction.chemical);
      const alternative = catalog.chemical.find(
        (doc) => String(doc._id) !== currentId,
      );
      if (!alternative) return null;

      return {
        reason: `Salah pilih jenis chemical saat transaksi dibuat, pelanggan sebenarnya memilih "${alternative.name}" bukan "${transaction.chemicalSnapshot.name}".`,
        requestedChanges: { chemicalId: String(alternative._id) },
      };
    },
  },
];

export async function seedChangeRequests(count: number): Promise<void> {
  await connectDB();

  // PRD §5.14: none of the five category models have an isActive field, so
  // (unlike the old ServiceModel.find({ isActive: true })) there is no
  // active/inactive filter to apply here — every document is eligible.
  const [haircut, shaving, treatment, colouring, chemical] = await Promise.all([
    HaircutModel.find({}).select("name").lean(),
    ShavingModel.find({}).select("name").lean(),
    TreatmentModel.find({}).select("name").lean(),
    ColouringModel.find({}).select("name").lean(),
    ChemicalModel.find({}).select("name").lean(),
  ]);
  const catalog: CategoryCatalog = {
    haircut,
    shaving,
    treatment,
    colouring,
    chemical,
  };

  const candidates = await TransactionModel.find({
    transactionStatus: { $ne: "CANCELLED" },
    "changeRequest.status": "NONE",
  }).sort({ createdAt: 1 });

  if (candidates.length === 0) {
    console.log(
      "No eligible transactions (need transactionStatus != CANCELLED and " +
        'changeRequest.status == "NONE"). Nothing to seed.',
    );
    return;
  }

  const targets = candidates.slice(0, count);
  let seeded = 0;

  for (let i = 0; i < targets.length; i++) {
    const transaction = targets[i];

    // Rotate the starting archetype per transaction for variety, falling
    // back through the rest of the list if the first pick doesn't apply.
    let built: BuiltChange | null = null;
    for (let offset = 0; offset < archetypes.length; offset++) {
      const archetype = archetypes[(i + offset) % archetypes.length];
      built = archetype.build(transaction, catalog);
      if (built) break;
    }

    if (!built) {
      console.log(
        `Skipped ${transaction.transactionCode}: no applicable change archetype given current data.`,
      );
      continue;
    }

    transaction.changeRequest = {
      status: "PENDING",
      requestedBy: transaction.agent,
      reason: built.reason,
      requestedChanges: built.requestedChanges,
      // Staggered so requests don't all share one identical timestamp —
      // the review queue sorts by requestedAt descending.
      requestedAt: new Date(Date.now() - i * 1000 * 60 * 37),
    };

    await transaction.save();
    seeded += 1;
    console.log(
      `Seeded PENDING change request on ${transaction.transactionCode} (${JSON.stringify(built.requestedChanges)}).`,
    );
  }

  console.log(
    `Done. Seeded ${seeded} change request(s) out of ${targets.length} candidate(s) considered ` +
      `(${candidates.length} total eligible transaction(s) found).`,
  );
}

function readCount(): number {
  const raw = process.env.SEED_CHANGE_REQUEST_COUNT;
  if (!raw) return DEFAULT_COUNT;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SEED_CHANGE_REQUEST_COUNT must be a positive integer, got "${raw}".`,
    );
  }
  return parsed;
}

seedChangeRequests(readCount())
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : String(error),
    );
    await mongoose.disconnect();
    process.exit(1);
  });
