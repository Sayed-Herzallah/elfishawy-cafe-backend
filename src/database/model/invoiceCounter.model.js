// src/database/model/invoiceCounter.model.js
// ============================================================
// عداد ترقيم الفواتير اليومي (Atomic Daily Counter)
// ------------------------------------------------------------
// كل مستند يمثل عدّاد يوم تجاري واحد: { _id: "invoice_2026-09-21", seq: N }
// التخصيص يتم ذرياً عبر findOneAndUpdate + $inc + upsert
// → تسلسلي، Race-safe، ويبدأ من 1 تلقائياً مع أول فاتورة في كل يوم.
// ============================================================
import mongoose from "mongoose";

const invoiceCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // "invoice_<dayKey>"
    seq: { type: Number, default: 0, min: 0 },
  },
  {
    versionKey: false,
    collection: "Invoice_Counter",
  }
);

export const invoiceCounterModel = mongoose.model("Invoice_Counter", invoiceCounterSchema);
