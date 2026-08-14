import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [30, "Name must not exceed 30 characters"],
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "Category_Data",
  }
);

export const categoryModel = mongoose.model("Category_Data", categorySchema);
