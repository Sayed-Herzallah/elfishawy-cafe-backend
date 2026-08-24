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
  const { items, paymentMethod, notes } = req.body;
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

    // ===== PHASE 3: Generate Order Number (Sequential starting from 1) =====
    const generateOrderNumber = async () => {
      const latestOrder = await orderModel.findOne({
        orderNumber: { $regex: "^[0-9]{1,6}$" }
      }).sort({ createdAt: -1 });

      let nextSequence = 1;
      if (latestOrder && latestOrder.orderNumber) {
        const lastNum = parseInt(latestOrder.orderNumber, 10);
        if (!isNaN(lastNum)) {
          nextSequence = lastNum + 1;
        }
      }
      return String(nextSequence);
    };

    // ===== PHASE 4: Create Order (with retry on duplicate orderNumber) =====
    let newOrder = null;
    let attempts = 0;
    while (!newOrder && attempts < 5) {
      attempts++;
      const orderNumber = await generateOrderNumber();
      try {
        newOrder = await orderModel.create({
          orderNumber,
          items: processedItems,
          totalAmount: calculatedTotal,
          paymentMethod,
          orderType,
          tableNumber,
          cashierId,
          status: orderStatuses.completed,
          notes: notes || "",
        });
      } catch (err) {
        // If duplicate key error on orderNumber, retry with next sequence
        if (err.code === 11000 && err.keyPattern?.orderNumber) {
          continue;
        }
        throw err;
      }
    }
    if (!newOrder) {
      return next(new Error('فشل توليد رقم فاتورة فريد، يرجى المحاولة مرة أخرى', { cause: 500 }));
    }

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

  // Anti-theft rule: cashiers can only ever see their OWN orders.
  // Only admins are allowed to view/filter sales across all cashiers.
  if (req.user.roleType === roles.admin) {
    if (cashierId) filter.cashierId = cashierId;
  } else {
    filter.cashierId = req.user._id;
  }

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

  // Anti-theft rule: a cashier may only open their OWN orders/invoices,
  // never another cashier's — prevents fishing through other shifts' sales.
  if (
    req.user.roleType !== roles.admin &&
    order.cashierId?._id?.toString() !== req.user._id.toString()
  ) {
    return next(new Error("Forbidden: You don't have access to this order", { cause: 403 }));
  }

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

// =========================== 5) Update Order ===========================
export const updateOrder = async (req, res, next) => {
  const { id } = req.params;
  const { items, paymentMethod, orderType, tableNumber, notes } = req.body;

  try {
    const order = await orderModel.findById(id);
    if (!order) return next(new Error("Order not found", { cause: 404 }));

    if (order.status === orderStatuses.cancelled) {
      return next(new Error("Cannot edit a cancelled order", { cause: 400 }));
    }

    // PHASE 1: Rollback current order's product stock and inventory levels
    for (const item of order.items) {
      await productModel.findByIdAndUpdate(item.product, {
        $inc: { stockQuantity: item.quantity },
        $set: { inStock: true },
      });

      const recipe = await recipeModel.findOne({ product: item.product, isActive: true });
      if (recipe) {
        for (const ing of recipe.ingredients) {
          const cpu = consumptionPerUnit(ing.inputQuantity, ing.inputUnit, ing.outputQuantity);
          const totalConsumptionBase = cpu * item.quantity;
          const invItem = await inventoryModel.findById(ing.inventoryItem);
          if (invItem) {
            const currentStockBase = convertToBase(invItem.quantity, invItem.unit);
            const restoredBase = currentStockBase + totalConsumptionBase;
            const restoredQty = baseToUnit(restoredBase, invItem.unit);
            await inventoryModel.findByIdAndUpdate(ing.inventoryItem, { quantity: restoredQty });
          }
        }
      }
    }

    // If no new items are passed, we keep the previous items but validate on the restored quantities
    const finalItems = items || order.items;

    // PHASE 2: Validate new items against restored quantities
    let calculatedTotal = 0;
    const processedItems = [];
    const productStockChanges = [];
    const inventoryDeductions = [];

    for (const item of finalItems) {
      const product = await productModel.findById(item.product);
      if (!product) {
        await restoreOrderQuantities(order);
        return next(new Error(`Product with ID ${item.product} not found`, { cause: 404 }));
      }

      if (product.stockQuantity < item.quantity) {
        await restoreOrderQuantities(order);
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

    // Validate Recipe-based Inventory availability for new items
    for (const item of processedItems) {
      const recipe = await recipeModel.findOne({
        product: item.product,
        isActive: true,
      }).populate("ingredients.inventoryItem");

      if (!recipe) continue;

      for (const ing of recipe.ingredients) {
        const invItem = ing.inventoryItem;
        if (!invItem) {
          await restoreOrderQuantities(order);
          return next(new Error(`Ingredient inventory item not found in recipe for product ${item.product}`, { cause: 404 }));
        }
        const cpu = consumptionPerUnit(ing.inputQuantity, ing.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;
        const currentStockBase = convertToBase(invItem.quantity, invItem.unit);

        if (currentStockBase < totalConsumptionBase) {
          await restoreOrderQuantities(order);
          const canMake = Math.floor(currentStockBase / cpu);
          return next(new Error(
            `Insufficient inventory for "${invItem.name}". Available quantity: ${canMake} cups.`,
            { cause: 400 }
          ));
        }

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
        await restoreOrderQuantities(order);
        const invItem = await inventoryModel.findById(ded.inventoryId);
        return next(new Error(
          `Insufficient combined inventory for "${invItem?.name}". Cannot fulfil total order.`,
          { cause: 400 }
        ));
      }
    }

    // PHASE 3: Deduct product.stockQuantity
    for (const stock of productStockChanges) {
      await productModel.findByIdAndUpdate(stock.productId, {
        stockQuantity: stock.newQuantity,
        inStock: stock.newQuantity > 0,
      });
    }

    // PHASE 4: Deduct Inventory (Recipe-based)
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

    // PHASE 5: Save order fields
    order.items = processedItems;
    order.totalAmount = calculatedTotal;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (orderType) order.orderType = orderType;
    if (tableNumber !== undefined) order.tableNumber = tableNumber;
    if (notes !== undefined) order.notes = notes;

    await order.save();

    const orderData = await orderModel.findById(order._id)
      .populate("items.product", "name price image")
      .populate("cashierId", "userName email");

    return res.status(200).json({
      success: true,
      message: "Order updated and inventory recalculated successfully",
      data: orderData,
    });

  } catch (err) {
    return next(new Error(`Failed to update order: ${err.message}`, { cause: 500 }));
  }
};

// Helper function to restore order stock if update validation fails
const restoreOrderQuantities = async (order) => {
  for (const item of order.items) {
    await productModel.findByIdAndUpdate(item.product, {
      $inc: { stockQuantity: -item.quantity },
    });
    // Restore raw ingredients too
    const recipe = await recipeModel.findOne({ product: item.product, isActive: true });
    if (recipe) {
      for (const ing of recipe.ingredients) {
        const cpu = consumptionPerUnit(ing.inputQuantity, ing.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;
        const invItem = await inventoryModel.findById(ing.inventoryItem);
        if (invItem) {
          const currentStockBase = convertToBase(invItem.quantity, invItem.unit);
          const restoredBase = Math.max(0, currentStockBase - totalConsumptionBase);
          const restoredQty = baseToUnit(restoredBase, invItem.unit);
          await inventoryModel.findByIdAndUpdate(ing.inventoryItem, { quantity: restoredQty });
        }
      }
    }
  }
};