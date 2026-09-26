import mongoose from "mongoose";
import { purchaseCounterModel } from "./model/purchaseCounter.model.js";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("DB connected successfully ✅");

    try {
      await purchaseCounterModel.createCollection();
    } catch (error) {
      if (error.code !== 48 && error.codeName !== "NamespaceExists") throw error;
    }

    // ─── ترحيل الفهرس القديم ──────────────────────────────────────
    // الفهرس الفريد العالمي القديم (orderNumber_1) يمنع تكرار رقم "1"
    // في يوم جديد → استُبدل بفهرس مركب فريد { dayKey, orderNumber }.
    // نحذفه مرة واحدة عند الإقلاع (آمن: لو غير موجود نتجاهل الخطأ).
    try {
      await mongoose.connection.db.collection("Order_Data").dropIndex("orderNumber_1");
      console.log("Dropped legacy global-unique index orderNumber_1 ✅");
    } catch {
      /* الفهرس غير موجود أو حُذف مسبقاً — تجاهل */
    }
  } catch (error) {
    console.error("Failed to connect DB ❌", error.message);
    throw error;
  }
};

export default connectDB;
