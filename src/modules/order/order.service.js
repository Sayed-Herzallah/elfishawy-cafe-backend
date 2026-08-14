import { orderModel, orderStatuses } from "../../database/model/order.model.js";
import { productModel } from "../../database/model/product.model.js";
import { customAlphabet } from "nanoid";

// =========================== 1) Create Order ===========================
export const createOrder = async (req, res, next) => {
  const { items, paymentMethod, orderType, tableNumber } = req.body;
  const cashierId = req.user._id;

  let calculatedTotal = 0;
  const processedItems = [];
  const stockRollbacks = []; // To track changes for rolling back in case of error

  try {
    for (const item of items) {
      const product = await productModel.findById(item.product);
      if (!product) {
        return next(new Error(`Product with ID ${item.product} not found`, { cause: 404 }));
      }

      if (!product.inStock || product.stockQuantity < item.quantity) {
        return next(new Error(`Insufficient stock for product "${product.name}". Available: ${product.stockQuantity}`, { cause: 400 }));
      }

      // Add to total
      calculatedTotal += product.price * item.quantity;

      processedItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price, // capture current price
      });

      // Track stock changes
      stockRollbacks.push({
        productId: product._id,
        newQuantity: product.stockQuantity - item.quantity,
      });
    }

    // Generate unique order number (EFC + YYMMDD + 4 digits)
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const randomDigits = customAlphabet("0123456789", 4)();
    const orderNumber = `EFC-${dateStr}-${randomDigits}`;

    // Create Order
    const newOrder = await orderModel.create({
      orderNumber,
      items: processedItems,
      totalAmount: calculatedTotal,
      paymentMethod,
      orderType,
      tableNumber,
      cashierId,
      status: orderStatuses.completed, // Default POS orders to completed immediately
    });

    // Update stocks in DB
    for (const stock of stockRollbacks) {
      await productModel.findByIdAndUpdate(stock.productId, {
        stockQuantity: stock.newQuantity,
        inStock: stock.newQuantity > 0,
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

  // If order is already cancelled, prevent status changes
  if (order.status === orderStatuses.cancelled) {
    return next(new Error("Cannot change status of a cancelled order", { cause: 400 }));
  }

  // If order is being cancelled, restore stock!
  if (status === orderStatuses.cancelled && order.status !== orderStatuses.cancelled) {
    for (const item of order.items) {
      await productModel.findByIdAndUpdate(item.product, {
        $inc: { stockQuantity: item.quantity },
        $set: { inStock: true },
      });
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
