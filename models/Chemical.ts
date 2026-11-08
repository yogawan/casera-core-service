// @/models/Chemical.ts
import { model, models, Schema } from "mongoose";

const ChemicalSchema = new Schema(
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
        default: 60,
        min: 0,
        max: 100,
      },

      employeePercentage: {
        type: Number,
        required: true,
        default: 40,
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

ChemicalSchema.pre("validate", function () {
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

export default models.Chemical || model("Chemical", ChemicalSchema);
