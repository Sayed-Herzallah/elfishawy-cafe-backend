import { processedOperationModel } from "../../database/model/processedOperation.model.js";
import { orderModel, orderStatuses } from "../../database/model/order.model.js";
import { productModel } from "../../database/model/product.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { recipeModel } from "../../database/model/recipe.model.js";
import { categoryModel } from "../../database/model/category.model.js";
import { expenseModel } from "../../database/model/expense.model.js";
import { consumptionPerUnit, convertToBase, repairIngredientInput } from "../../utils/recipe/unitConverter.js";

const baseToUnit = (baseQty, unit) => {
  const u = (unit || "").toUpperCase();
  if (u === "KG") return baseQty / 1000;
  if (u === "GRAM") return baseQty;
  if (u === "LITER") return baseQty / 1000;
  if (u === "ML") return baseQty;
  if (u === "PIECE") return baseQty;
  if (u === "SPOON") return baseQty / 5;
  return baseQty;
};

export const pullCatalog = async (req, res) => {
  const [categories, products, inventory, recipes] = await Promise.all([
    categoryModel.find({}).lean(),
    productModel.find({}).populate("category").lean(),
    inventoryModel.find({}).lean(),
    recipeModel.find({ isActive: true }).populate("ingredients.inventoryItem").lean(),
  ]);

  return res.status(200).json({
    success: true,
    message: "Offline catalog snapshot retrieved successfully",
    data: {
      categories,
      products,
      inventory,
      recipes,
      serverTime: new Date().toISOString(),
    },
  });
};

export const processBatchPush = async (req, res) => {
  const { operations } = req.body;
  const deviceId = req.headers["x-device-id"] || "DEFAULT-POS";
  const userId = req.user._id;

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No operations to process",
      results: [],
    });
  }

  const results = [];

  for (const op of operations) {
    const { operationId, operationType, payload, createdAt } = op;

    if (!operationId) continue;

    const existing = await processedOperationModel.findOne({ operationId });
    if (existing) {
      results.push({
        operationId,
        status: existing.status,
        resultData: existing.resultData,
        alreadyProcessed: true,
      });
      continue;
    }

    try {
      let resultData = null;

      if (operationType === "CREATE_ORDER") {
        resultData = await handleSyncOrder(payload, userId, createdAt);
      } else if (operationType === "CREATE_EXPENSE") {
        resultData = await handleSyncExpense(payload, userId, createdAt);
      } else if (operationType === "RESTOCK_INVENTORY") {
        resultData = await handleSyncRestock(payload, userId, createdAt);
      } else {
        throw new Error("Unknown operation type: " + operationType);
      }

      await processedOperationModel.create({
        operationId,
        deviceId,
        operationType,
        userId,
        status: "SUCCESS",
        resultData,
        originalTimestamp: new Date(createdAt || Date.now()),
      });

      results.push({
        operationId,
        status: "SUCCESS",
        resultData,
      });
    } catch (err) {
      console.error("Sync Operation " + operationId + " Failed:", err.message);

      await processedOperationModel.create({
        operationId,
        deviceId,
        operationType,
        userId,
        status: "FAILED",
        errorMessage: err.message,
        originalTimestamp: new Date(createdAt || Date.now()),
      });

      results.push({
        operationId,
        status: "FAILED",
        error: err.message,
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: "Batch operations synchronized successfully",
    results,
  });
};

const handleSyncOrder = async (payload, userId, createdAt) => {
  const { items, tableNumber, notes } = payload;

  let calculatedTotal = 0;
  const processedItems = [];

  for (const item of items) {
    const product = await productModel.findById(item.product);
    const unitPrice = item.price !== undefined ? item.price : (product ? product.price : 0);
    calculatedTotal += unitPrice * item.quantity;
    processedItems.push({
      product: item.product,
      quantity: item.quantity,
      price: unitPrice,
    });

    await productModel.findByIdAndUpdate(item.product, {
      $inc: { stockQuantity: -item.quantity },
    });

    const recipe = await recipeModel.findOne({ product: item.product, isActive: true });
    if (recipe) {
      for (const ing of recipe.ingredients) {
        const invItem = await inventoryModel.findById(ing.inventoryItem);
        if (invItem) {
          const stockBase = convertToBase(invItem.quantity, invItem.unit);
          const repaired = repairIngredientInput(ing, stockBase);
          const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity);
          const totalConsumptionBase = cpu * item.quantity;

          const currentStockBase = convertToBase(invItem.quantity, invItem.unit);
          const newStockBase = currentStockBase - totalConsumptionBase;
          const newQtyInUnit = baseToUnit(newStockBase, invItem.unit);

          await inventoryModel.findByIdAndUpdate(ing.inventoryItem, {
            quantity: newQtyInUnit,
          });
        }
      }
    }
  }

  const latestOrder = await orderModel.findOne({
    orderNumber: { $regex: "^[0-9]{1,6}$" }
  }).sort({ createdAt: -1 });

  let nextSequence = 1;
  if (latestOrder && latestOrder.orderNumber) {
    const lastNum = parseInt(latestOrder.orderNumber, 10);
    if (!isNaN(lastNum)) nextSequence = lastNum + 1;
  }

  const syncTag = payload.offlineOrderNumber ? (" [Sync: " + payload.offlineOrderNumber + "]") : "";
  const newOrder = await orderModel.create({
    orderNumber: String(nextSequence),
    items: processedItems,
    totalAmount: calculatedTotal,
    tableNumber: tableNumber || 1,
    cashierId: userId,
    status: orderStatuses.completed,
    notes: (notes || "") + syncTag,
    createdAt: new Date(createdAt || Date.now()),
  });

  return {
    orderId: newOrder._id,
    orderNumber: newOrder.orderNumber,
    totalAmount: newOrder.totalAmount,
  };
};

const handleSyncExpense = async (payload, userId, createdAt) => {
  const newExp = await expenseModel.create({
    description: payload.description,
    amount: payload.amount,
    category: payload.category || "other",
    addedBy: userId,
    date: new Date(createdAt || Date.now()),
  });
  return { expenseId: newExp._id };
};

const handleSyncRestock = async (payload, userId, createdAt) => {
  const { inventoryId, quantityAdded, costPrice } = payload;
  const item = await inventoryModel.findById(inventoryId);
  if (!item) throw new Error("Inventory item not found");

  item.quantity = (item.quantity || 0) + Number(quantityAdded);
  item.lastRestocked = new Date(createdAt || Date.now());
  item.lastRestockedBy = userId;
  if (costPrice) item.costPrice = costPrice;
  await item.save();

  return { inventoryId: item._id, newQuantity: item.quantity };
};
