import { orderModel, orderStatuses } from "../../database/model/order.model.js";
import { expenseModel } from "../../database/model/expense.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { reservationModel, reservationStatuses } from "../../database/model/reservation.model.js";

// =========================== 1) Get KPIs / Stats ===========================
export const getStats = async (req, res, next) => {
  try {
    // 1. Total Sales Revenue
    const salesAgg = await orderModel.aggregate([
      { $match: { status: orderStatuses.completed } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const totalSales = salesAgg[0]?.total || 0;

    // 2. Completed Orders Count
    const totalOrdersCount = await orderModel.countDocuments({ status: orderStatuses.completed });

    // 3. Total Expenses
    const expensesAgg = await expenseModel.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalExpenses = expensesAgg[0]?.total || 0;

    // 4. Net Profit
    const netProfit = totalSales - totalExpenses;

    // 5. Low Stock Inventory Count
    const lowStockCount = await inventoryModel.countDocuments({
      $expr: { $lte: ["$quantity", "$minLimit"] },
    });

    // 6. Active Reservations Count (pending or confirmed)
    const activeReservationsCount = await reservationModel.countDocuments({
      status: { $in: [reservationStatuses.pending, reservationStatuses.confirmed] },
    });

    return res.status(200).json({
      success: true,
      message: "KPI stats retrieved successfully",
      data: {
        totalSales,
        totalOrdersCount,
        totalExpenses,
        netProfit,
        lowStockCount,
        activeReservationsCount,
      },
    });
  } catch (err) {
    return next(new Error(`Failed to calculate stats: ${err.message}`, { cause: 500 }));
  }
};

// =========================== 2) Get Charts Data ===========================
export const getCharts = async (req, res, next) => {
  try {
    // 1. Sales Trend over the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesTrend = await orderModel.aggregate([
      {
        $match: {
          status: orderStatuses.completed,
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSales: { $sum: "$totalAmount" },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 2. Expense breakdown by category
    const expenseBreakdown = await expenseModel.aggregate([
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // 3. Top 5 Best-Selling Products
    const topProducts = await orderModel.aggregate([
      { $match: { status: orderStatuses.completed } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          quantitySold: { $sum: "$items.quantity" },
          revenueGenerated: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "Product_Data",
          localField: "_id",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$productDetails" },
      {
        $project: {
          _id: 1,
          quantitySold: 1,
          revenueGenerated: 1,
          name: "$productDetails.name",
          price: "$productDetails.price",
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "Charts data retrieved successfully",
      data: {
        salesTrend,
        expenseBreakdown,
        topProducts,
      },
    });
  } catch (err) {
    return next(new Error(`Failed to retrieve charts data: ${err.message}`, { cause: 500 }));
  }
};
