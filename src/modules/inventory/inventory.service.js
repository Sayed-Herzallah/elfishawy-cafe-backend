import { inventoryModel } from "../../database/model/inventory.model.js";

// =========================== 1) Create Item ===========================
export const createItem = async (req, res, next) => {
  const { name, quantity, unit, minLimit } = req.body;

  const existing = await inventoryModel.findOne({ name });
  if (existing) return next(new Error("Inventory item name already exists", { cause: 409 }));

  const newItem = await inventoryModel.create({
    name,
    quantity: Number(quantity) || 0,
    unit,
    minLimit: Number(minLimit),
    lastRestocked: new Date(),
  });

  return res.status(201).json({
    success: true,
    message: "Inventory item created successfully",
    data: newItem,
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
  const { quantity } = req.body;

  const item = await inventoryModel.findById(id);
  if (!item) return next(new Error("Inventory item not found", { cause: 404 }));

  item.quantity += Number(quantity);
  item.lastRestocked = new Date();
  item.lastRestockedBy = req.user._id; // audit trail: who added this stock
  await item.save();

  const populatedItem = await inventoryModel
    .findById(item._id)
    .populate("lastRestockedBy", "userName roleType");

  return res.status(200).json({
    success: true,
    message: "Inventory item restocked successfully",
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
  const { name, unit, minLimit } = req.body;

  const item = await inventoryModel.findById(id);
  if (!item) return next(new Error("Inventory item not found", { cause: 404 }));

  if (name && name !== item.name) {
    const existing = await inventoryModel.findOne({ name });
    if (existing) return next(new Error("Inventory item name already exists", { cause: 409 }));
    item.name = name;
  }

  if (unit) item.unit = unit;
  if (minLimit !== undefined) item.minLimit = Number(minLimit);

  item.lastRestocked = new Date();
  item.lastRestockedBy = req.user._id;
  await item.save();

  const populatedItem = await inventoryModel
    .findById(item._id)
    .populate("lastRestockedBy", "userName roleType");

  return res.status(200).json({
    success: true,
    message: "Inventory item updated successfully",
    data: populatedItem,
  });
};
