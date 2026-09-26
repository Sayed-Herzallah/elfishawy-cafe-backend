import mongoose from "mongoose";

const purchaseCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  {
    versionKey: false,
    collection: "Purchase_Counter",
  }
);

export const purchaseCounterModel = mongoose.model("Purchase_Counter", purchaseCounterSchema);