/**
 * fix-purchase-numbers.js — إصلاح أرقام المشتريات وإصلاح صنف المخزن المشكوك فيه
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
await mongoose.connect(MONGO_URI);
console.log("✅ متصل بـ MongoDB\n");

const db = mongoose.connection.db;

// 1) فحص Purchase_Counter
console.log("🔍 Purchase_Counter:");
const pCounters = await db.collection("Purchase_Counter").find({}).toArray();
if (pCounters.length === 0) {
  console.log("   ❌ فارغ — أرقام الشراء لم تُنشأ بعد");
} else {
  for (const c of pCounters) {
    console.log(`   - ${c._id}: seq=${c.seq}`);
  }
}

// 2) إصلاح purchaseNumber للقيود القديمة (بدون رقم)
console.log("\n🔧 إصلاح purchaseNumber للقيود القديمة...");
const expensesNoPurchaseNum = await db.collection("Expense_Data").find({
  category: "inventory",
  $or: [
    { purchaseNumber: { $exists: false } },
    { purchaseNumber: null },
    { purchaseNumber: "" },
  ],
}).sort({ date: 1 }).toArray();

console.log(`   قيود بدون رقم شراء: ${expensesNoPurchaseNum.length}`);

// تجميع حسب اليوم لإعادة الترقيم
const byDay = new Map();
for (const e of expensesNoPurchaseNum) {
  const d = new Date(e.date || e.createdAt);
  const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (!byDay.has(dayKey)) byDay.set(dayKey, []);
  byDay.get(dayKey).push(e);
}

let totalFixed = 0;
for (const [dayKey, items] of byDay.entries()) {
  // اجلب العداد الحالي لهذا اليوم
  const counterId = `purchase_${dayKey}`;
  const existingCounter = await db.collection("Purchase_Counter").findOne({ _id: counterId });
  let startSeq = existingCounter?.seq ?? 0;
  
  for (const e of items) {
    startSeq++;
    const purchaseNumber = `P-${dayKey.replace(/-/g, "")}-${String(startSeq).padStart(4, "0")}`;
    await db.collection("Expense_Data").updateOne(
      { _id: e._id },
      { $set: { purchaseNumber } }
    );
    console.log(`   ✅ ${e._id}: purchaseNumber=${purchaseNumber}`);
    totalFixed++;
  }

  // تحديث العداد
  await db.collection("Purchase_Counter").updateOne(
    { _id: counterId },
    { $set: { seq: startSeq } },
    { upsert: true }
  );
}

console.log(`\n✅ تم إصلاح ${totalFixed} قيد بأرقام شراء جديدة`);

// 3) التحقق من الصنف اللي مشكوك فيه "الله" وتكلفته العالية
console.log("\n⚠️  تحذير: الصنف 'الله' لديه قيد بـ 12,302 جنيه — مشتريات مشبوهة:");
const bigExpense = await db.collection("Expense_Data").findOne({ amount: 12302 });
if (bigExpense) {
  console.log(`   القيد: ${JSON.stringify(bigExpense, null, 2)}`);
}

await mongoose.disconnect();
console.log("\n✅ اكتمل الإصلاح");
