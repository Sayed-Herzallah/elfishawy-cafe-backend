import mongoose from "mongoose";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { expenseModel } from "../../database/model/expense.model.js";
import { syncProductsForInventoryItem } from "../../utils/recipe/productStockSync.js";
import { createPurchaseNumber } from "../expense/purchaseNumber.service.js";

/** تحويل آمن للأرقام — Number(undefined) بيرجع NaN وده اللي كان بيكسر الحسابات */
const toNumOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// =========================== 1) Create Item ===========================
export const createItem = async (req, res, next) => {
  const { name, quantity, unit, minLimit, costPrice, totalCost, clientInventoryId } = req.body;
  const qtyNum = toNumOr(quantity, 0);
  const openingExpenseId = clientInventoryId ? `${clientInventoryId}:opening` : undefined;

  // Idempotency: صنف أُنشئ أوفلاين واتبعت للمزامنة مرتين (قطع نت أثناء الرد)
  // يرجع نفس الصنف الموجود بدل إنشاء صنف مكرر بنفس الاسم.
  if (clientInventoryId) {
    const alreadyCreated = await inventoryModel.findOne({ clientInventoryId })
      .populate("lastRestockedBy", "userName roleType");
    if (alreadyCreated) {
      let openingExpense = openingExpenseId
        ? await expenseModel.findOne({ clientExpenseId: openingExpenseId }).select("_id purchaseNumber clientExpenseId").lean()
        : null;
      if (!openingExpense && qtyNum > 0) {
        const total = totalCost !== undefined && totalCost !== null && totalCost !== ""
          ? toNumOr(totalCost, 0)
          : Number((toNumOr(costPrice, 0) * qtyNum).toFixed(2));
        const purchaseNumber = await createPurchaseNumber();
        const [createdExpense] = await expenseModel.create([{
          description: `رصيد افتتاحي: ${name} - كمية: ${qtyNum} ${unit}`,
          amount: total,
          category: "inventory",
          inventoryItemLinked: alreadyCreated._id,
          inventoryQuantityAdded: qtyNum,
          unitCost: qtyNum > 0 && total > 0 ? Number((total / qtyNum).toFixed(2)) : undefined,
          date: new Date(),
          addedBy: req.user._id,
          clientExpenseId: openingExpenseId,
          purchaseNumber,
        }]);
        openingExpense = createdExpense;
      }
      return res.status(200).json({
        success: true,
        message: "Inventory item already synced",
        data: alreadyCreated,
        openingExpense,
      });
    }
  }

  // Calculate costPrice if totalCost provided, or calculate totalCost if costPrice provided
  let finalCostPrice = 0;
  let finalTotalCost = 0;

  if (totalCost !== undefined && totalCost !== null && totalCost !== "") {
    finalTotalCost = toNumOr(totalCost, 0);
    finalCostPrice = qtyNum > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : 0;
  } else if (costPrice !== undefined && costPrice !== null && costPrice !== "") {
    finalCostPrice = toNumOr(costPrice, 0);
    finalTotalCost = Number((finalCostPrice * qtyNum).toFixed(2));
  }

  const existing = await inventoryModel.findOne({ name });
  if (existing) return next(new Error("Inventory item name already exists", { cause: 409 }));

  const newItem = await inventoryModel.create({
    name,
    quantity: qtyNum,
    unit,
    minLimit: toNumOr(minLimit, 5),
    costPrice: finalCostPrice,
    lastRestockTotalCost: finalTotalCost,
    lastRestocked: new Date(),
    lastRestockedBy: req.user._id,
    clientInventoryId: clientInventoryId || undefined,
  });

  // 🧾 تسجيل الرصيد الافتتاحي في سجل المشتريات — عشان كل حاجة بتتضاف للمخزون تظهر هناك
  let openingExpense = null;
  if (qtyNum > 0) {
    try {
      const purchaseNumber = await createPurchaseNumber();
      const [createdExpense] = await expenseModel.create([{
        description: `رصيد افتتاحي: ${name} - كمية: ${qtyNum} ${unit}`,
        amount: finalTotalCost,
        category: "inventory",
        inventoryItemLinked: newItem._id,
        inventoryQuantityAdded: qtyNum,
        unitCost: qtyNum > 0 && finalTotalCost > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : undefined,
        date: new Date(),
        addedBy: req.user._id,
        clientExpenseId: openingExpenseId,
        purchaseNumber,
      }]);
      openingExpense = createdExpense;
    } catch {
      if (clientInventoryId) throw new Error("Failed to record opening inventory purchase");
    }
  }

  const populatedItem = await inventoryModel
    .findById(newItem._id)
    .populate("lastRestockedBy", "userName roleType");

  if (qtyNum > 0) {
    try {
      await syncProductsForInventoryItem(newItem._id.toString());
    } catch {
      // تحسيني
    }
  }

  return res.status(201).json({
    success: true,
    message: "Inventory item created successfully",
    data: populatedItem,
    openingExpense: openingExpense
      ? { _id: openingExpense._id, clientExpenseId: openingExpense.clientExpenseId, purchaseNumber: openingExpense.purchaseNumber }
      : null,
  });
};

// =========================== 2) List Inventory ===========================
export const listInventory = async (req, res, next) => {
  const { search, lowStock } = req.query;

  const filter = {};

  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  // If lowStock is set, find items where quantity is below or equal to minLimit
  if (lowStock === "true") {
    filter.$expr = { $lte: ["$quantity", "$minLimit"] };
  }

  const data = await inventoryModel.find(filter)
    .sort({ createdAt: -1 })
    .populate("lastRestockedBy", "userName roleType")
    .lean();

  return res.status(200).json({
    success: true,
    message: "Inventory list retrieved successfully",
    data,
  });
};

// =========================== 3) Restock Item ===========================
export const restockItem = async (req, res, next) => {
  const { id } = req.params;
  const { quantity, totalCost, costPrice, clientRestockId } = req.body;
  const qtyNum = toNumOr(quantity, 0);
  let applied = true;
  let expenseId = null;
  let purchaseNumber = null;
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        applied = true;
        expenseId = null;
        purchaseNumber = null;
        if (clientRestockId) {
          const existing = await expenseModel.findOne({
            $or: [
              { clientRestockId },
              { clientExpenseId: clientRestockId },
              { description: `OFFLINE_RESTOCK:${clientRestockId}` },
            ],
          }).session(session);
          if (existing) {
            applied = false;
            expenseId = existing._id;
            purchaseNumber = existing.purchaseNumber || null;
            return;
          }
        }

        const item = await inventoryModel.findById(id).session(session);
        if (!item) throw new Error("Inventory item not found", { cause: 404 });

        // Update stock and create its purchase ledger record in the same transaction.
        let finalCostPrice = toNumOr(item.costPrice, 0);
        let finalTotalCost = toNumOr(item.lastRestockTotalCost, 0);
        if (totalCost !== undefined && totalCost !== null && totalCost !== "") {
          finalTotalCost = toNumOr(totalCost, 0);
          finalCostPrice = qtyNum > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : finalCostPrice;
        } else if (costPrice !== undefined && costPrice !== null && costPrice !== "") {
          finalCostPrice = toNumOr(costPrice, 0);
          finalTotalCost = Number((finalCostPrice * qtyNum).toFixed(2));
        }

        item.quantity += qtyNum;
        item.costPrice = finalCostPrice;
        item.lastRestockTotalCost = finalTotalCost;
        item.lastRestocked = new Date();
        item.lastRestockedBy = req.user._id;
        await item.save({ session });

        purchaseNumber = await createPurchaseNumber(session);
        const [purchaseExpense] = await expenseModel.create([{
          description: `توريد مخزون: ${item.name} - كمية: ${qtyNum} ${item.unit}`,
          amount: finalTotalCost,
          category: "inventory",
          inventoryItemLinked: item._id,
          inventoryQuantityAdded: qtyNum,
          unitCost: qtyNum > 0 && finalTotalCost > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : undefined,
          date: new Date(),
          addedBy: req.user._id,
          clientRestockId: clientRestockId || undefined,
          clientExpenseId: clientRestockId || undefined,
          purchaseNumber,
        }], { session });
        expenseId = purchaseExpense._id;
      });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    if (clientRestockId && err.code === 11000) {
      const existing = await expenseModel.findOne({
        $or: [
          { clientRestockId },
          { clientExpenseId: clientRestockId },
          { description: `OFFLINE_RESTOCK:${clientRestockId}` },
        ],
      });
      if (existing) {
        applied = false;
        expenseId = existing._id;
        purchaseNumber = existing.purchaseNumber || null;
      } else {
        return next(new Error(`Failed to restock inventory: ${err.message}`, { cause: 500 }));
      }
    } else {
      return next(new Error(`Failed to restock inventory: ${err.message}`, { cause: err.cause || 500 }));
    }
  }

  try {
    await syncProductsForInventoryItem(id);
  } catch {
    // تحسيني — فشل المزامنة لا يوقف التوريد
  }

  const populatedItem = await inventoryModel
    .findById(id)
    .populate("lastRestockedBy", "userName roleType");

  return res.status(200).json({
    success: true,
    message: applied ? "Inventory item restocked successfully" : "Restock already synced",
    data: populatedItem,
    expenseId,
    purchaseNumber,
  });
};

// =========================== 4) Delete Item ===========================
export const deleteItem = async (req, res, next) => {
  const { id } = req.params;

  const item = await inventoryModel.findById(id);
  if (!item) return next(new Error("Inventory item not found", { cause: 404 }));

  await inventoryModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: "Inventory item deleted successfully",
  });
};

// =========================== 5) Update Item ===========================
export const updateItem = async (req, res, next) => {
  const { id } = req.params;
  const { name, quantity, unit, minLimit, costPrice, totalCost } = req.body;

  const item = await inventoryModel.findById(id);
  if (!item) return next(new Error("Inventory item not found", { cause: 404 }));

  if (name && name !== item.name) {
    const existing = await inventoryModel.findOne({ name });
    if (existing) return next(new Error("Inventory item name already exists", { cause: 409 }));
    item.name = name;
  }

  if (quantity !== undefined) {
    item.quantity = toNumOr(quantity, item.quantity);
    item.lastRestocked = new Date();
    item.lastRestockedBy = req.user._id;
  }

  if (unit) item.unit = unit;
  if (minLimit !== undefined) item.minLimit = Number(minLimit);

  // Handle costPrice and totalCost calculations
  let costChanged = false;
  if (costPrice !== undefined && costPrice !== null && costPrice !== "") {
    item.costPrice = toNumOr(costPrice, item.costPrice);
    costChanged = true;
  }
  if (totalCost !== undefined && totalCost !== null && totalCost !== "") {
    // If totalCost provided, recalculate costPrice based on current quantity
    if (item.quantity && item.quantity > 0) {
      item.costPrice = Number((Number(totalCost) / Number(item.quantity)).toFixed(2));
    } else {
      item.costPrice = 0;
    }
    item.lastRestockTotalCost = toNumOr(totalCost, item.lastRestockTotalCost);
    costChanged = true;
  }

  // الطابع الزمني للتوريد بيتحدث فقط لما التكلفة تتغير — تعديل الاسم/الحد مش توريد
  if (costChanged) {
    item.lastRestocked = new Date();
    item.lastRestockedBy = req.user._id;
  }
  await item.save();

  if (quantity !== undefined) {
    try {
      await syncProductsForInventoryItem(item._id.toString());
    } catch {
      // تحسيني
    }
  }

  const populatedItem = await inventoryModel
    .findById(item._id)
    .populate("lastRestockedBy", "userName roleType");

  return res.status(200).json({
    success: true,
    message: "Inventory item updated successfully",
    data: populatedItem,
  });
};
