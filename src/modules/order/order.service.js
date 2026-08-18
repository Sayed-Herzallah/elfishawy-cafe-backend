import { orderModel, orderStatuses } from "../../database/model/order.model.js";
import { productModel } from "../../database/model/product.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { recipeModel } from "../../database/model/recipe.model.js";
import { consumptionPerUnit, convertToBase } from "../../utils/recipe/unitConverter.js";
import { customAlphabet } from "nanoid";

// Convert a base-unit quantity back to a stored unit quantity
const baseToUnit = (baseQty, unit) => {
  const u = unit.toUpperCase();
  if (u === "KG") return baseQty / 1000;
  if (u === "GRAM") return baseQty;
  if (u === "LITER") return baseQty / 1000;
  if (u === "ML") return baseQty;
  if (u === "PIECE") return baseQty;
  return baseQty; // fallback
};

// =========================== 1) Create Order ===========================
export const createOrder = async (req, res, next) => {
  const { items, paymentMethod, orderType, tableNumber } = req.body;
  const cashierId = req.user._id;

  let calculatedTotal = 0;
  const processedItems = [];
  const productStockChanges = [];
  const inventoryDeductions = [];

  try {
    // ===== PHASE 1: Validate products & accumulate product stock changes =====
    for (const item of items) {
      const product = await productModel.findById(item.product);
      if (!product) {
        return next(new Error(`Product with ID ${item.product} not found`, { cause: 404 }));
      }

      if (!product.inStock || product.stockQuantity < item.quantity) {
        return next(new Error(
          `Insufficient stock for product "${product.name}". Available: ${product.stockQuantity}`,
          { cause: 400 }
        ));
      }

      calculatedTotal += product.price * item.quantity;
      processedItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
      });
      productStockChanges.push({
        productId: product._id,
        newQuantity: product.stockQuantity - item.quantity,
      });
    }

    // ===== PHASE 2: Check Recipe-based Inventory availability =====
    for (const item of processedItems) {
      const recipe = await recipeModel.findOne({
        product: item.product,
        isActive: true,
      }).populate("ingredients.inventoryItem");

      if (!recipe) continue;

      for (const ing of recipe.ingredients) {
        const invItem = ing.inventoryItem;
        if (!invItem) {
          return next(new Error(`Ingredient inventory item not found in recipe for product ${item.product}`, { cause: 404 }));
        }
        const cpu = consumptionPerUnit(ing.inputQuantity, ing.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;
        const currentStockBase = convertToBase(invItem.quantity, invItem.unit);

        if (currentStockBase < totalConsumptionBase) {
          const canMake = Math.floor(currentStockBase / cpu);
          return next(new Error(
            `Insufficient inventory for "${invItem.name}". Available quantity: ${canMake} cups.`,
            { cause: 400 }
          ));
        }

        // Accumulate deductions — merge same ingredient across products
        const existing = inventoryDeductions.find(
          (d) => d.inventoryId.toString() === invItem._id.toString()
        );
        if (existing) {
          existing.consumptionBase += totalConsumptionBase;
        } else {
          inventoryDeductions.push({
            inventoryId: invItem._id,
            currentQuantity: invItem.quantity,
            currentUnit: invItem.unit,
            consumptionBase: totalConsumptionBase,
          });
        }
      }
    }

    // Re-validate merged deductions for shared ingredients
    for (const ded of inventoryDeductions) {
      const currentStockBase = convertToBase(ded.currentQuantity, ded.currentUnit);
      if (currentStockBase < ded.consumptionBase) {
        const invItem = await inventoryModel.findById(ded.inventoryId);
        return next(new Error(
          `Insufficient combined inventory for "${invItem?.name}". Cannot fulfil total order.`,
          { cause: 400 }
        ));
      }
    }

    // ===== PHASE 3: Generate Order Number =====
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const randomDigits = customAlphabet("0123456789", 4)();
    const orderNumber = `EFC-${dateStr}-${randomDigits}`;

    // ===== PHASE 4: Create Order =====
    const newOrder = await orderModel.create({
      orderNumber,
      items: processedItems,
      totalAmount: calculatedTotal,
      paymentMethod,
      orderType,
      tableNumber,
      cashierId,
      status: orderStatuses.completed,
    });

    // ===== PHASE 5: Deduct product.stockQuantity =====
    for (const stock of productStockChanges) {
      await productModel.findByIdAndUpdate(stock.productId, {
        stockQuantity: stock.newQuantity,
        inStock: stock.newQuantity > 0,
      });
    }

    // ===== PHASE 6: Deduct Inventory (Recipe-based) =====
    for (const ded of inventoryDeductions) {
      const invItem = await inventoryModel.findById(ded.inventoryId);
      if (!invItem) continue;

      const currentStockBase = convertToBase(invItem.quantity, invItem.unit);
      const newStockBase = Math.max(0, currentStockBase - ded.consumptionBase);
      const newQuantityInUnit = baseToUnit(newStockBase, invItem.unit);

      await inventoryModel.findByIdAndUpdate(ded.inventoryId, {
        quantity: newQuantityInUnit,
      });
    }

    const orderData = await orderModel.findById(newOrder._id)
      .populate("items.product", "name price image")
      .populate("cashierId", "userName email");

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: orderData,
    });

  } catch (err) {
    return next(new Error(`Failed to place order: ${err.message}`, { cause: 500 }));
  }
};

// =========================== 2) Get Orders ===========================
export const getOrders = async (req, res, next) => {
  const { status, orderType, searchDate, cashierId } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (orderType) filter.orderType = orderType;
  if (cashierId) filter.cashierId = cashierId;

  if (searchDate) {
    const start = new Date(searchDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(searchDate);
    end.setHours(23, 59, 59, 999);
    filter.createdAt = { $gte: start, $lte: end };
  }

  const data = await orderModel.find(filter)
    .sort({ createdAt: -1 })
    .populate("items.product")
    .populate("cashierId")
    .lean();

  return res.status(200).json({
    success: true,
    message: "Orders retrieved successfully",
    data,
  });
};

// =========================== 3) Get Order ===========================
export const getOrder = async (req, res, next) => {
  const { id } = req.params;

  const order = await orderModel.findById(id)
    .populate("items.product", "name price description image")
    .populate("cashierId", "userName email");

  if (!order) return next(new Error("Order not found", { cause: 404 }));

  return res.status(200).json({
    success: true,
    message: "Order retrieved successfully",
    data: order,
  });
};

// =========================== 4) Update Order Status ===========================
export const updateOrderStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = await orderModel.findById(id);
  if (!order) return next(new Error("Order not found", { cause: 404 }));

  if (order.status === orderStatuses.cancelled) {
    return next(new Error("Cannot change status of a cancelled order", { cause: 400 }));
  }

  if (status === orderStatuses.cancelled && order.status !== orderStatuses.cancelled) {
    // Restore product stock
    for (const item of order.items) {
      await productModel.findByIdAndUpdate(item.product, {
        $inc: { stockQuantity: item.quantity },
        $set: { inStock: true },
      });
    }

    // Restore inventory (recipe-based)
    for (const item of order.items) {
      const recipe = await recipeModel.findOne({
        product: item.product,
        isActive: true,
      });
      if (!recipe) continue;

      for (const ing of recipe.ingredients) {
        const cpu = consumptionPerUnit(ing.inputQuantity, ing.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;

        const invItem = await inventoryModel.findById(ing.inventoryItem);
        if (!invItem) continue;

        const currentStockBase = convertToBase(invItem.quantity, invItem.unit);
        const restoredBase = currentStockBase + totalConsumptionBase;
        const restoredQty = baseToUnit(restoredBase, invItem.unit);

        await inventoryModel.findByIdAndUpdate(ing.inventoryItem, {
          quantity: restoredQty,
        });
      }
    }
  }

  order.status = status;
  await order.save();

  const updatedOrder = await orderModel.findById(id)
    .populate("items.product", "name price image")
    .populate("cashierId", "userName email");

  return res.status(200).json({
    success: true,
    message: "Order status updated successfully",
    data: updatedOrder,
  });
};
