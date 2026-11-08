// @/models/Customer.ts
import { model, models, Schema } from "mongoose";

// Narrowed structure per PRD §5.3 (decided 2026-11-08, executed here).
// Removed from the previous shape: customerCode, email, gender, birthDate,
// address, notes, customerType, lastVisitAt — none are part of the target
// field set. `isActive`/`loyaltyPoints` carry over unchanged (still active
// preconditions/earning logic elsewhere). `busyness` is free text — PRD
// left its type undecided ("jangan diasumsikan sendiri"); confirmed via
// user decision as descriptive text rather than enum/number/boolean.
//
// services/customerService.ts, validations/customerSchema.ts, and the
// /customers routes still reference the removed fields as of this change —
// migrating them is tracked separately (PRD §5.3, PLAN-GROOMA.md Phase 12),
// out of scope for a models-only change.
const CustomerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    cityFrom: {
      type: String,
      trim: true,
    },

    age: {
      type: Number,
      min: 0,
    },

    busyness: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    loyaltyPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ name: 1 });

export default models.Customer || model("Customer", CustomerSchema);
