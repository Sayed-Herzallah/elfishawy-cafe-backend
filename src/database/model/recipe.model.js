import mongoose from "mongoose";
import { UNITS } from "../../utils/recipe/unitConverter.js";

const ingredientSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory_Data",
      required: [true, "Inventory item reference is required"],
    },
    inputQuantity: {
      type: Number,
      required: [true, "Input quantity is required"],
      min: [0.001, "Input quantity must be greater than 0"],
    },
    inputUnit: {
      type: String,
      required: [true, "Input unit is required"],
      enum: {
        values: Object.values(UNITS),
        message: `Input unit must be one of: ${Object.values(UNITS).join(", ")}`
      },
      uppercase: true,
    },
    outputQuantity: {
      type: Number,
      required: [true, "Output quantity (cups/servings produced) is required"],
      min: [1, "Output quantity must be at least 1"],
    },
  },
  { _id: true }
);

const recipeSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product_Data",
      required: [true, "Product reference is required"],
      unique: true,
    },
    ingredients: {
      type: [ingredientSchema],
      validate: {
        validator: (arr) => arr.length >= 1,
        message: "A recipe must have at least one ingredient",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "Recipe_Data",
  }
);

export const recipeModel = mongoose.model("Recipe_Data", recipeSchema);
