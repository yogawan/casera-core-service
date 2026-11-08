import { model, models, Schema } from "mongoose";

// §10.3: changedBy (requester), reason, before/after snapshots, changedAt,
// approvedBy (reviewer), approvalReference. Append-only via the approval
// API — nothing in this codebase ever updates or removes an existing entry.
const ChangeHistorySchema = new Schema(
  {
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    before: {
      type: Schema.Types.Mixed,
      required: true,
    },

    after: {
      type: Schema.Types.Mixed,
      required: true,
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    approvalReference: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

// Shared by all five category snapshot fields below (PRD §5.14) — a point-
// in-time copy of {name, price, ownerPercentage, employeePercentage} taken
// from the chosen Haircut/Shaving/Treatment/Colouring/Chemical document at
// creation time, so transaction history never changes if the catalog entry
// is edited later. Modeled as its own Schema (not an inline nested object)
// so an unset category (e.g. no shaving on this transaction) leaves
// shavingSnapshot entirely absent instead of Mongoose demanding its
// required inner fields anyway.
const CategorySnapshotSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    ownerPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    employeePercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false },
);

const TransactionSchema = new Schema(
  {
    transactionCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    agent: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Who performed the service — distinct from `agent`, who only processed
    // the sale at the register (§5.5). Required (PLAN-GROOMA.md Phase 10):
    // services/transactionService.ts resolves and validates employeeId
    // before every create, so this is always populated by the time it runs.
    // Prerequisite: scripts/backfillEmployeeRecords.ts must have been run
    // against this deployment's database first, or every existing AGENT
    // without a backfilled Employee record will be unable to create
    // transactions.
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    // PRD §5.14: Service (single catalog) is replaced by five optional
    // category refs — a transaction fills 1 to 5 of these at once (e.g.
    // haircut + shaving in the same visit), never more than one document
    // per category. "At least one of the five" is enforced below by this
    // schema's own pre("validate") hook, mirroring how `service` used to
    // be `required: true`.
    haircut: {
      type: Schema.Types.ObjectId,
      ref: "Haircut",
      default: null,
    },

    haircutSnapshot: {
      type: CategorySnapshotSchema,
    },

    shaving: {
      type: Schema.Types.ObjectId,
      ref: "Shaving",
      default: null,
    },

    shavingSnapshot: {
      type: CategorySnapshotSchema,
    },

    treatment: {
      type: Schema.Types.ObjectId,
      ref: "Treatment",
      default: null,
    },

    treatmentSnapshot: {
      type: CategorySnapshotSchema,
    },

    colouring: {
      type: Schema.Types.ObjectId,
      ref: "Colouring",
      default: null,
    },

    colouringSnapshot: {
      type: CategorySnapshotSchema,
    },

    chemical: {
      type: Schema.Types.ObjectId,
      ref: "Chemical",
      default: null,
    },

    chemicalSnapshot: {
      type: CategorySnapshotSchema,
    },

    paymentMethod: {
      type: String,
      enum: ["CASH", "QRIS"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      default: "PENDING",
    },

    transactionStatus: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },

    serviceHourType: {
      type: String,
      enum: ["REGULAR", "OVERTIME"],
      default: "REGULAR",
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    ownerRevenue: {
      type: Number,
      required: true,
      min: 0,
    },

    employeeRevenue: {
      type: Number,
      required: true,
      min: 0,
    },

    // Computed unconditionally at creation from `total`, same as
    // owner/employeeRevenue above — this is "what this sale is worth in
    // points," not "has it been credited yet." The actual increment to
    // Customer.loyaltyPoints only happens once paymentStatus is/becomes PAID
    // (services/transactionService.ts, services/paymentService.ts), so a
    // still-PENDING QRIS transaction shows the points it WILL earn, not
    // points already given.
    pointsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentReference: {
      type: String,
      trim: true,
    },

    paidAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    changeHistory: {
      type: [ChangeHistorySchema],
      default: [],
    },

    changeRequest: {
      status: {
        type: String,
        enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
        default: "NONE",
      },

      requestedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      reason: {
        type: String,
        trim: true,
      },

      requestedChanges: {
        type: Schema.Types.Mixed,
      },

      reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      reviewNote: {
        type: String,
        trim: true,
      },

      requestedAt: {
        type: Date,
      },

      reviewedAt: {
        type: Date,
      },
    },

    receipt: {
      printed: {
        type: Boolean,
        default: false,
      },

      printedAt: {
        type: Date,
      },

      printCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// PRD §5.14: replaces the old `service: required: true` invariant now that
// there are five independent optional refs instead of one required one.
TransactionSchema.pre("validate", function () {
  const hasAnyCategory =
    this.haircut ||
    this.shaving ||
    this.treatment ||
    this.colouring ||
    this.chemical;

  if (!hasAnyCategory) {
    this.invalidate(
      "haircut",
      "At least one of haircut, shaving, treatment, colouring, or chemical is required.",
    );
  }
});

TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ branch: 1, createdAt: -1 });
TransactionSchema.index({ agent: 1, createdAt: -1 });
TransactionSchema.index({ employee: 1, createdAt: -1 });
TransactionSchema.index({ customer: 1, createdAt: -1 });
TransactionSchema.index({ haircut: 1, createdAt: -1 });
TransactionSchema.index({ shaving: 1, createdAt: -1 });
TransactionSchema.index({ treatment: 1, createdAt: -1 });
TransactionSchema.index({ colouring: 1, createdAt: -1 });
TransactionSchema.index({ chemical: 1, createdAt: -1 });
TransactionSchema.index({ paymentStatus: 1, createdAt: -1 });
TransactionSchema.index({
  transactionStatus: 1,
  createdAt: -1,
});

export default models.Transaction || model("Transaction", TransactionSchema);
