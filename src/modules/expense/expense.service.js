import { expenseModel } from "../../database/model/expense.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { roles } from "../../database/model/user.model.js";
import { syncProductsForInventoryItem } from "../../utils/recipe/productStockSync.js";

// =========================== 1) Create Expense ===========================
export const createExpense = async (req, res, next) => {
  const { description, amount, category, inventoryItemLinked, inventoryQuantityAdded, totalCost, unitCost, date } = req.body;
  const addedBy = req.user._id;

  // Anti-theft rule: a cashier may only log "inventory" expenses (e.g. buying
  // supplies on the spot). Categories like "salaries" or "rent" are business
  // financials that stay admin-only — a cashier has no legitimate reason to
  // create them, and allowing it would let them fabricate/inflate costs.
  if (req.user.roleType === roles.cashier && category !== "inventory") {
    return next(new Error(
      "Cashiers can only log inventory-related expenses",
      { cause: 403 }
    ));
  }

  try {
    if (category === "inventory") {
      const item = await inventoryModel.findById(inventoryItemLinked);
      if (!item) return next(new Error("Linked inventory item not found", { cause: 404 }));

      const qtyNum = Number(inventoryQuantityAdded) || 0;
      // الإجمالي = totalCost المرسل وإلا amount (هما نفس الشيء في فاتورة الشراء)
      const finalTotalCost = Number(totalCost ?? amount) || 0;
      const finalUnitCost =
        qtyNum > 0 && finalTotalCost > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : 0;

      // Restock inventory item automatically!
      item.quantity += qtyNum;
      item.costPrice = finalUnitCost || item.costPrice;
      item.lastRestockTotalCost = finalTotalCost;
      item.lastRestocked = date || new Date();
      await item.save();

      try {
        await syncProductsForInventoryItem(item._id.toString());
      } catch {
        // تحسيني
      }

      const newExpense = await expenseModel.create({
        description,
        amount: Number(amount),
        category,
        inventoryItemLinked,
        inventoryQuantityAdded: qtyNum || undefined,
        unitCost: finalUnitCost,
        date: date || new Date(),
        addedBy,
      });

      const expenseData = await expenseModel.findById(newExpense._id)
        .populate("inventoryItemLinked", "name unit lastRestockTotalCost")
        .populate("addedBy", "userName email");

      return res.status(201).json({
        success: true,
        message: "Expense logged successfully",
        data: expenseData,
      });
    }

    const newExpense = await expenseModel.create({
      description,
      amount: Number(amount),
      category,
      inventoryItemLinked,
      inventoryQuantityAdded: Number(inventoryQuantityAdded) || undefined,
      unitCost: Number(unitCost) || undefined,
      date: date || new Date(),
      addedBy,
    });

    const expenseData = await expenseModel.findById(newExpense._id)
      .populate("inventoryItemLinked", "name unit lastRestockTotalCost")
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

  // Purchases visibility rule: a cashier may see raw-material purchase records
  // (category "inventory") regardless of who logged them — admin restocks or
  // their own spot buys. Every other category (rent, salaries, utilities...)
  // stays invisible to cashiers, so they still never see operating costs.
  if (req.user.roleType === roles.cashier) {
    filter.category = "inventory";
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

// =========================== 4) Update Expense ===========================
export const updateExpense = async (req, res, next) => {
  const { id } = req.params;
  const { description, amount, category, inventoryItemLinked, inventoryQuantityAdded, totalCost, unitCost, date } = req.body;

  try {
    const expense = await expenseModel.findById(id);
    if (!expense) return next(new Error("Expense not found", { cause: 404 }));

    // 1. Rollback previous inventory adjustment if it was of inventory category
    if (expense.category === "inventory" && expense.inventoryItemLinked) {
      const prevItem = await inventoryModel.findById(expense.inventoryItemLinked);
      if (prevItem) {
        prevItem.quantity = Math.max(0, prevItem.quantity - (expense.inventoryQuantityAdded || 0));
        await prevItem.save();
      }
    }

    // 2. Apply new inventory adjustment if new category is inventory
    const finalCategory = category || expense.category;
    const finalLinkedItem = inventoryItemLinked !== undefined ? inventoryItemLinked : expense.inventoryItemLinked;
    const finalQtyAdded = inventoryQuantityAdded !== undefined ? Number(inventoryQuantityAdded) : expense.inventoryQuantityAdded;
    const finalTotalCost = totalCost !== undefined ? Number(totalCost) : undefined;
    const finalUnitCost =
      finalQtyAdded > 0 && finalTotalCost > 0
        ? Number((finalTotalCost / finalQtyAdded).toFixed(2))
        : unitCost !== undefined
        ? Number(unitCost) || 0
        : undefined;

    if (finalCategory === "inventory" && finalLinkedItem) {
      const newItem = await inventoryModel.findById(finalLinkedItem);
      if (!newItem) return next(new Error("Linked inventory item not found", { cause: 404 }));

      newItem.quantity += Number(finalQtyAdded || 0);
      if (finalUnitCost !== undefined && finalUnitCost > 0) {
        newItem.costPrice = finalUnitCost;
      }
      if (finalTotalCost !== undefined) {
        newItem.lastRestockTotalCost = finalTotalCost;
      }
      newItem.lastRestocked = date || new Date();
      await newItem.save();

      try {
        await syncProductsForInventoryItem(newItem._id.toString());
      } catch {
        // تحسيني
      }
    }

    // 3. Update expense fields
    if (description) expense.description = description;
    if (amount !== undefined) expense.amount = Number(amount);
    expense.category = finalCategory;
    expense.inventoryItemLinked = finalCategory === "inventory" ? finalLinkedItem : undefined;
    expense.inventoryQuantityAdded = finalCategory === "inventory" ? finalQtyAdded : undefined;
    if (finalCategory === "inventory" && finalUnitCost !== undefined) {
      expense.unitCost = finalUnitCost;
    }
    if (date) expense.date = date;

    await expense.save();

    const updatedData = await expenseModel.findById(expense._id)
      .populate("inventoryItemLinked", "name unit lastRestockTotalCost")
      .populate("addedBy", "userName email");

    return res.status(200).json({
      success: true,
      message: "Expense updated and inventory adjusted successfully",
      data: updatedData,
    });
  } catch (err) {
    return next(new Error(`Failed to update expense: ${err.message}`, { cause: 500 }));
  }
};
