import mongoose from "mongoose";

export const reservationStatuses = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
};

const reservationSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      minlength: [3, "Name must be at least 3 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    tableNumber: {
      type: Number,
      required: [true, "Table number is required"],
      min: [1, "Table number must be positive"],
    },
    guestCount: {
      type: Number,
      required: [true, "Guest count is required"],
      min: [1, "Guest count must be at least 1"],
    },
    reservationTime: {
      type: Date,
      required: [true, "Reservation time is required"],
    },
    status: {
      type: String,
      enum: Object.values(reservationStatuses),
      default: reservationStatuses.pending,
    },
  },
  {
    timestamps: true,
    collection: "Reservation_Data",
  }
);

export const reservationModel = mongoose.model("Reservation_Data", reservationSchema);
