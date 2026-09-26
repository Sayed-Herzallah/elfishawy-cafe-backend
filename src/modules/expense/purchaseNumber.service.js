import { purchaseCounterModel } from "../../database/model/purchaseCounter.model.js";
import { getBusinessDayKey } from "../../utils/businessDay.js";

export const createPurchaseNumber = async (session, date = new Date()) => {
  const dayKey = getBusinessDayKey(date);
  let query = purchaseCounterModel.findOneAndUpdate(
    { _id: `purchase_${dayKey}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  if (session) query = query.session(session);
  const counter = await query;
  return `P-${dayKey.replace(/-/g, "")}-${String(counter.seq).padStart(4, "0")}`;
};