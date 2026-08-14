// ===================== Import Modules =====================
import connectDB from "./database/connect.js";
import { notFoundHandler } from "./utils/errorhandling/notfoundhandler.js";
import { globalErrorHandler } from "./utils/errorhandling/globalhandler.js";
import limiter from "./middleware/express.limit.middleware.js";
import helmet from "helmet";
import cors from "cors";

// ===================== Import Database & Auth Utils =====================
import { userModel, roles } from "./database/model/user.model.js";
import { hashPassword } from "./utils/hashing/hashing.js";
import { encryptPhone } from "./utils/encryption/encryption.js";

// ===================== Import Routers =====================
import authRouter from "./modules/auth/auth.controller.js";
import userRouter from "./modules/user/user.controller.js";
import categoryRouter from "./modules/category/category.controller.js";
import productRouter from "./modules/product/product.controller.js";
import orderRouter from "./modules/order/order.controller.js";
import inventoryRouter from "./modules/inventory/inventory.controller.js";
import expenseRouter from "./modules/expense/expense.controller.js";
import reservationRouter from "./modules/reservation/reservation.controller.js";
import analyticsRouter from "./modules/analytics/analytics.controller.js";

// ===================== Validate Env & Initialize Users =====================
const initializeDefaultAccounts = async () => {
  const requiredEnv = [
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "CASHIER_EMAIL",
    "CASHIER_PASSWORD",
  ];

  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables: ${missing.join(", ")}. ` +
        `Please add them to your .env file before starting the server.`
    );
  }

  // Admin Account
  const adminEmail = process.env.ADMIN_EMAIL;
  const existingAdmin = await userModel.findOne({ email: adminEmail });

  if (!existingAdmin) {
    const adminPasswordHash = hashPassword({ plainText: process.env.ADMIN_PASSWORD });
    const adminPhone = encryptPhone({ cipherText: "00000000000" });

    await userModel.create({
      userName: process.env.ADMIN_NAME || "Admin",
      email: adminEmail,
      password: adminPasswordHash,
      phone: adminPhone,
      address: process.env.ADMIN_ADDRESS || "",
      roleType: roles.admin,
      verify: true,
    });
    console.log("✅ Admin account created successfully");
  } else {
    console.log("ℹ️ Admin account already exists, skipping creation");
  }

  // Cashier Account
  const cashierEmail = process.env.CASHIER_EMAIL;
  const existingCashier = await userModel.findOne({ email: cashierEmail });

  if (!existingCashier) {
    const cashierPasswordHash = hashPassword({ plainText: process.env.CASHIER_PASSWORD });
    const cashierPhone = encryptPhone({ cipherText: "00000000000" });

    await userModel.create({
      userName: process.env.CASHIER_NAME || "Cashier",
      email: cashierEmail,
      password: cashierPasswordHash,
      phone: cashierPhone,
      address: process.env.CASHIER_ADDRESS || "",
      roleType: roles.cashier,
      verify: true,
    });
    console.log("✅ Cashier account created successfully");
  } else {
    console.log("ℹ️ Cashier account already exists, skipping creation");
  }
};

export const bootstrap = async (app, express) => {
  // CORS configuration
  app.use(cors({
    origin: "*"
  }));

  // Trust proxy for rate limiting (especially on hosting like Vercel/Render)
  app.set("trust proxy", 1);

  // Helmet for security headers
  app.use(helmet());

  // Database Connection
  await connectDB();

  // Initialize default Admin & Cashier accounts from .env
  await initializeDefaultAccounts();

  // Rate limiting middleware
  app.use(limiter);

  // ===================== Route Definitions =====================
  app.use("/auth", authRouter);
  app.use("/users", userRouter);
  app.use("/categories", categoryRouter);
  app.use("/products", productRouter);
  app.use("/orders", orderRouter);
  app.use("/inventory", inventoryRouter);
  app.use("/expenses", expenseRouter);
  app.use("/reservations", reservationRouter);
  app.use("/analytics", analyticsRouter);

  // ===================== Error Handlers =====================
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
};
