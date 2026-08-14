import { expenseModel } from "../../database/model/expense.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";

// =========================== 1) Create Expense ===========================
export const createExpense = async (req, res, next) => {
  const { description, amount, category, inventoryItemLinked, inventoryQuantityAdded, date } = req.body;
  const addedBy = req.user._id;

  try {
    if (category === "inventory") {
      const item = await inventoryModel.findById(inventoryItemLinked);
      if (!item) return next(new Error("Linked inventory item not found", { cause: 404 }));

      // Restock inventory item automatically!
      item.quantity += Number(inventoryQuantityAdded);
      item.lastRestocked = date || new Date();
      await item.save();
    }

    const newExpense = await expenseModel.create({
      description,
      amount: Number(amount),
      category,
      inventoryItemLinked,
      inventoryQuantityAdded: Number(inventoryQuantityAdded) || undefined,
      date: date || new Date(),
      addedBy,
    });

    const expenseData = await expenseModel.findById(newExpense._id)
      .populate("inventoryItemLinked", "name unit")
      .populate("addedBy", "userName email");

    return res.status(201).json({
      success: true,
      message: "Expense logged successfully",
      data: expenseData,
    });

  } catch (err) {
    return next(new Error(`Failed to log expense: ${err.message}`, { cause: 500 }));
  }
};

// =========================== 2) List Expenses ===========================
export const listExpenses = async (req, res, next) => {
  const { category, searchDate } = req.query;

  const filter = {};

  if (category) {
    filter.category = category;
  }

  if (searchDate) {
    const start = new Date(searchDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(searchDate);
    end.setHours(23, 59, 59, 999);
    filter.date = { $gte: start, $lte: end };
  }

  const data = await expenseModel.find(filter)
    .sort({ createdAt: -1 })
    .populate("inventoryItemLinked")
    .populate("addedBy")
    .lean();

  return res.status(200).json({
    success: true,
    message: "Expenses retrieved successfully",
    data,
  });
};

// =========================== 3) Delete Expense ===========================
export const deleteExpense = async (req, res, next) => {
  const { id } = req.params;

  const expense = await expenseModel.findById(id);
  if (!expense) return next(new Error("Expense not found", { cause: 404 }));

  // If it was an inventory purchase, rollback the quantity
  if (expense.category === "inventory" && expense.inventoryItemLinked) {
    const item = await inventoryModel.findById(expense.inventoryItemLinked);
    if (item) {
      item.quantity = Math.max(0, item.quantity - expense.inventoryQuantityAdded);
      await item.save();
    }
  }

  await expenseModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: "Expense log deleted and inventory rolled back successfully",
  });
};
