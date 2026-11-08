// @/models/Shaving.ts
import { model, models, Schema } from "mongoose";

const ShavingSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    revenueSharing: {
      ownerPercentage: {
        type: Number,
        required: true,
        default: 50,
        min: 0,
        max: 100,
      },

      employeePercentage: {
        type: Number,
        required: true,
        default: 50,
        min: 0,
        max: 100,
      },
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

ShavingSchema.pre("validate", function () {
  const revenueSharing = this.revenueSharing;

  if (!revenueSharing) {
    this.invalidate("revenueSharing", "Revenue sharing is required.");
    return;
  }

  const total =
    revenueSharing.ownerPercentage + revenueSharing.employeePercentage;

  if (total !== 100) {
    this.invalidate(
      "revenueSharing",
      "Owner and employee percentages must total 100%.",
    );
  }
});

export default models.Shaving || model("Shaving", ShavingSchema);
