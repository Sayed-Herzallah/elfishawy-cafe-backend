import mongoose from "mongoose";

const processedOperationSchema = new mongoose.Schema(
  {
    operationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    operationType: {
      type: String,
      required: true,
      enum: ["CREATE_ORDER", "RESTOCK_INVENTORY", "CREATE_EXPENSE"],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User_Data",
      required: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      default: "SUCCESS",
    },
    resultData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    originalTimestamp: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "Processed_Operations",
  }
);

export const processedOperationModel = mongoose.model(
  "Processed_Operations",
  processedOperationSchema
);
