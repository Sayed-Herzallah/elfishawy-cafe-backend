import mongoose from "mongoose";

export const expenseCategories = {
  rent: "rent",
  salaries: "salaries",
  utilities: "utilities",
  inventory: "inventory",
  other: "other",
};

const expenseSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [3, "Description must be at least 3 characters"],
      maxlength: [100, "Description must not exceed 100 characters"],
    },
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    category: {
      type: String,
      enum: Object.values(expenseCategories),
      default: expenseCategories.other,
    },
    inventoryItemLinked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory_Data",
      required: function () {
        return this.category === expenseCategories.inventory;
      },
    },
    inventoryQuantityAdded: {
      type: Number,
      required: function () {
        return this.category === expenseCategories.inventory;
      },
      min: [0.1, "Quantity added must be greater than 0"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User_Data",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "Expense_Data",
  }
);

export const expenseModel = mongoose.model("Expense_Data", expenseSchema);
