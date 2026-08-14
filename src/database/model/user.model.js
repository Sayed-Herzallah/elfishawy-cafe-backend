import mongoose from "mongoose";

export const roles = {
  admin: "admin",
  cashier: "cashier",
};

const userSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: [true, "Name is required"],
      minlength: [3, "Name must be at least 3 characters"],
      maxlength: [30, "Name must not exceed 30 characters"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      immutable: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    verify: {
      type: Boolean,
      default: true, // Created by admin, so pre-verified
    },
    roleType: {
      type: String,
      enum: Object.values(roles),
      default: roles.cashier,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "User_Data",
  }
);

export const userModel = mongoose.model("User_Data", userSchema);
