// @/models/Employee.ts
import { model, models, Schema } from "mongoose";

// Scaffold only — not read or written by any service/route yet (PRD §5.13).
// `branch` still lives on User until one of §5.13's triggers (Attendance,
// Payroll, employment history) is actually in scope; `compensation` has been
// removed from User and is now declared only here, so this is its sole
// definition. Two other models hold a structural `ref: "Employee"` without
// this model being wired to any service/route: Attendance.ts (pre-existing)
// and Transaction.ts's `employee` field (PLAN Phase 10 — added as an
// optional field pending the Employee backfill, see that file). Don't wire
// this model to a service/route without re-reading §5.13's prerequisites
// first.
const EmployeeSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    compensation: {
      regularSalary: {
        type: Number,
        default: 0,
        min: 0,
      },

      overtimeRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      compensationType: {
        type: String,
        enum: ["FIXED", "COMMISSION", "HYBRID"],
        default: "COMMISSION",
      },
    },

    employmentStatus: {
      type: String,
      enum: ["ACTIVE", "RESIGNED", "SUSPENDED"],
      default: "ACTIVE",
    },

    joinedAt: {
      type: Date,
      required: true,
    },

    resignedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default models.Employee || model("Employee", EmployeeSchema);
