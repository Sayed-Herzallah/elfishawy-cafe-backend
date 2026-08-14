import mongoose from "mongoose";

export const codeOTP = {
  activateAccount: "activateAccount",
  forgetPassword: "forgetPassword",
};

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User_Data",
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    codeType: {
      type: String,
      enum: Object.values(codeOTP),
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "OTP_Codes",
  }
);

// Auto-delete OTP documents after 10 minutes (600 seconds)
otpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

export const otpModel = mongoose.model("OTP_Codes", otpSchema);
