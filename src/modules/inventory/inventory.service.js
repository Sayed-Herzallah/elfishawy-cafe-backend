import { inventoryModel } from "../../database/model/inventory.model.js";
import { expenseModel } from "../../database/model/expense.model.js";
import { syncProductsForInventoryItem } from "../../utils/recipe/productStockSync.js";

/** تحويل آمن للأرقام — Number(undefined) بيرجع NaN وده اللي كان بيكسر الحسابات */
const toNumOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// =========================== 1) Create Item ===========================
export const createItem = async (req, res, next) => {
  const { name, quantity, unit, minLimit, costPrice, totalCost } = req.body;

  const qtyNum = toNumOr(quantity, 0);

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
  });

  // 🧾 تسجيل الرصيد الافتتاحي في سجل المشتريات — عشان كل حاجة بتتضاف للمخزون تظهر هناك
  if (qtyNum > 0) {
    try {
      await expenseModel.create({
        description: `رصيد افتتاحي: ${name} - كمية: ${qtyNum} ${unit}`,
        amount: finalTotalCost,
        category: "inventory",
        inventoryItemLinked: newItem._id,
        inventoryQuantityAdded: qtyNum,
        unitCost: qtyNum > 0 && finalTotalCost > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : undefined,
        date: new Date(),
        addedBy: req.user._id,
      });
    } catch {
      // تسجيل القيد تحسيني — فشله مبيوقفش إنشاء الصنف
    }
  }

  const populatedItem = await inventoryModel
    .findById(newItem._id)
    .populate("lastRestockedBy", "userName roleType");

  return res.status(201).json({
    success: true,
    message: "Inventory item created successfully",
    data: populatedItem,
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
  const { quantity, totalCost, costPrice } = req.body;

  const item = await inventoryModel.findById(id);
  if (!item) return next(new Error("Inventory item not found", { cause: 404 }));

  const qtyNum = toNumOr(quantity, 0);

  // الحسابات على الكمية الموردة نفسها: الإجمالي ÷ الكمية الموردة = سعر وحدة التوريد الجديد
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
  item.lastRestockedBy = req.user._id; // audit trail: who added this stock
  await item.save();

  // 🔄 مزامنة أرصدة المنتجات المرتبطة — المنتج النافذ يفتح تلقائياً بعد التوريد
  try {
    await syncProductsForInventoryItem(item._id.toString());
  } catch {
    // تحسيني — فشل المزامنة لا يوقف التوريد
  }

  // 🧾 تسجيل التوريد في سجل المشتريات — عشان توريد المدير يظهر هناك باسمه زي الكاشير
  let expenseCreated = true;
  try {
    await expenseModel.create({
      description: `توريد مخزون: ${item.name} - كمية: ${qtyNum} ${item.unit}`,
      amount: finalTotalCost,
      category: "inventory",
      inventoryItemLinked: item._id,
      inventoryQuantityAdded: qtyNum,
      unitCost: qtyNum > 0 && finalTotalCost > 0 ? Number((finalTotalCost / qtyNum).toFixed(2)) : undefined,
      date: new Date(),
      addedBy: req.user._id,
    });
  } catch {
    expenseCreated = false;
  }

  const populatedItem = await inventoryModel
    .findById(item._id)
    .populate("lastRestockedBy", "userName roleType");

  return res.status(200).json({
    success: true,
    message: expenseCreated
      ? "Inventory item restocked successfully"
      : "Inventory item restocked successfully (expense log skipped)",
    data: populatedItem,
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
