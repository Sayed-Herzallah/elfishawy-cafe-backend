import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Inventory item name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Item name must be at least 2 characters"],
      maxlength: [50, "Item name must not exceed 50 characters"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      default: 0,
      min: [0, "Quantity cannot be negative"],
    },
    unit: {
      type: String,
      required: [true, "Measurement unit is required"],
      trim: true,
    },
    minLimit: {
      type: Number,
      required: [true, "Minimum threshold/limit is required"],
      default: 5,
      min: [0, "Minimum threshold cannot be negative"],
    },
    costPrice: {
      type: Number,
      default: 0,
      min: [0, "Cost price cannot be negative"],
    },
    lastRestockTotalCost: {
      type: Number,
      default: 0,
      min: [0, "Total cost cannot be negative"],
    },
    lastRestocked: {
      type: Date,
      default: Date.now,
    },
    lastRestockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User_Data",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "Inventory_Data",
  }
);

export const inventoryModel = mongoose.model("Inventory_Data", inventorySchema);
