import mongoose from "mongoose";

export const orderStatuses = {
  pending: "pending",
  completed: "completed",
  cancelled: "cancelled",
};

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product_Data",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity must be at least 1"],
        },
        price: {
          type: Number,
          required: true,
          min: [0, "Price cannot be negative"],
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },
    status: {
      type: String,
      enum: Object.values(orderStatuses),
      default: orderStatuses.completed, // Default to completed as it's POS-driven usually
    },
    tableNumber: {
      type: Number,
      required: true,
      min: [1, "Table number must be at least 1"],
    },
    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User_Data",
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "Order_Data",
  }
);

export const orderModel = mongoose.model("Order_Data", orderSchema);
