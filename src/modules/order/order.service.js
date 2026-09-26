import { orderModel, orderStatuses } from "../../database/model/order.model.js";
import { invoiceCounterModel } from "../../database/model/invoiceCounter.model.js";
import { productModel } from "../../database/model/product.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { recipeModel } from "../../database/model/recipe.model.js";
import { roles } from "../../database/model/user.model.js";
import { getBusinessDayKey, getBusinessDayRange } from "../../utils/businessDay.js";
import { consumptionPerUnit, convertToBase, repairIngredientInput } from "../../utils/recipe/unitConverter.js";

// Convert a base-unit quantity back to a stored unit quantity
const baseToUnit = (baseQty, unit) => {
  const u = unit.toUpperCase();
  if (u === "KG") return baseQty / 1000;
  if (u === "GRAM") return baseQty;
  if (u === "LITER") return baseQty / 1000;
  if (u === "ML") return baseQty;
  if (u === "PIECE") return baseQty;
  if (u === "SPOON") return baseQty / 5;
  return baseQty; // fallback
};

// =========================== 1) Create Order ===========================
export const createOrder = async (req, res, next) => {
  const { items, tableNumber, notes, clientOrderId, clientCreatedAt } = req.body;
  const cashierId = req.user._id;

  // F4: الحفاظ على وقت الإنشاء الأصلي لفواتير الأوفلاين المتزامنة فقط.
  // - يُقبل clientCreatedAt فقط عند وجود clientOrderId (مسار المزامنة الأوفلاين)
  // - يُرفض أي تاريخ مستقبلي (هامش 5 دقائق لفروق الساعات) لمنع التلاعب
  // - createdAt في MongoDB يحمل اللحظة الحقيقية لإنشاء الفاتورة، ووقت الاستلام
  //   يظل محفوظاً في updatedAt + توثيق المزامنة في sync queue بالديسكتوب
  let offlineCreatedAt = null;
  if (clientOrderId && clientCreatedAt) {
    const parsed = new Date(clientCreatedAt);
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= Date.now() + 5 * 60 * 1000) {
      offlineCreatedAt = parsed;
    }
  }

  // Idempotency check: if order was already synced from offline queue, return it
  if (clientOrderId) {
    const existingSync = await orderModel.findOne({ clientOrderId })
      .populate("items.product", "name price image")
      .populate("cashierId", "userName email");
    if (existingSync) {
      return res.status(200).json({
        success: true,
        message: "Order already synced",
        data: existingSync,
      });
    }
  }

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

      // F5: الحفاظ على سعر البيع الفعلي وقت إنشاء الفاتورة الأوفلاين (clientOrderId موجود).
      // تغيير سعر المنتج الحالي في المنيو لا يغيّر قيمة فاتورة قديمة.
      // الطلبات Online (بدون سعر مرسل) تظل تسعّر من المنتج كما كانت.
      const salePrice =
        clientOrderId && Number.isFinite(Number(item.price)) && Number(item.price) >= 0
          ? Number(item.price)
          : product.price;

      calculatedTotal += salePrice * item.quantity;
      processedItems.push({
        product: product._id,
        quantity: item.quantity,
        price: salePrice,
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
        const stockBase = convertToBase(invItem.quantity, invItem.unit);
        const repaired = repairIngredientInput(ing, stockBase);
        const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;
        const currentStockBase = convertToBase(invItem.quantity, invItem.unit);

        const isPrimary = ing.isPrimary !== false;

        if (isPrimary && currentStockBase < totalConsumptionBase) {
          const canMake = Math.floor(currentStockBase / cpu);
          return next(new Error(
            `رصيد خامة "${invItem.name}" غير كافٍ. الكمية المتاحة تكفي ${canMake} كوب فقط.`,
            { cause: 400 }
          ));
        }

        // Accumulate deductions — merge same ingredient across products
        const existing = inventoryDeductions.find(
          (d) => d.inventoryId.toString() === invItem._id.toString()
        );
        if (existing) {
          existing.consumptionBase += totalConsumptionBase;
          if (isPrimary) existing.isPrimary = true;
        } else {
          inventoryDeductions.push({
            inventoryId: invItem._id,
            currentQuantity: invItem.quantity,
            currentUnit: invItem.unit,
            consumptionBase: totalConsumptionBase,
            isPrimary,
          });
        }
      }
    }

    // Re-validate merged deductions for shared ingredients (PRIMARY only)
    for (const ded of inventoryDeductions) {
      if (!ded.isPrimary) continue;
      const currentStockBase = convertToBase(ded.currentQuantity, ded.currentUnit);
      if (currentStockBase < ded.consumptionBase) {
        const invItem = await inventoryModel.findById(ded.inventoryId);
        return next(new Error(
          `رصيد خامة "${invItem?.name}" غير كافٍ لتغطية إجمالي الطلب.`,
          { cause: 400 }
        ));
      }
    }

    // ===== PHASE 3: Generate Order Number (Atomic Daily Counter — Cairo Business Day) =====
    // الحل الجذري للترقيم اليومي:
    // 1) dayKey = اليوم التقويمي بتوقيت القاهرة (Africa/Cairo) — موحّد للسيرفر والويب والديسكتوب
    //    مهما كان timezone السيرفر (UTC على السحابة سابقاً كان يخرب حدود اليوم).
    //    F4: فواتير الأوفلاين المتزامنة تُرقَّم وتُجمَّع على يوم إنشائها الأصلي وليس يوم المزامنة.
    // 2) الترقيم من عداد ذري لكل يوم (Invoice_Counter) عبر findOneAndUpdate + $inc
    //    → تسلسلي، Race-safe، ويبدأ من 1 تلقائياً مع أول فاتورة في كل يوم.
    // 3) الفهرس الفريد بقى مركب { dayKey, orderNumber } — نفس الرقم يتكرر كل يوم بأمان.
    const dayKey = getBusinessDayKey(offlineCreatedAt || new Date());

    // حد أمان: يوم واحد في المقهى مستحيل يوصل 4 أرقام فواتير.
    // أي رقم أكبر من ده بيانات قديمة/قديمة الطراز (مثل 9607 أو 1173) ويجب ألّا
    // يبذر العداد اليومي ولا يرفعه — ده كان سبب ظهور أرقام فواتير ضخمة
    // (كل فاتورة جديدة كانت تكمل من 9608 و 9609 وهكذا).
    const MAX_PLAUSIBLE_DAILY_INVOICE = 999;
    const MAX_PLAUSIBLE_DIGITS = String(MAX_PLAUSIBLE_DAILY_INVOICE).length; // 3

    // أعلى رقم فعلي مسجَّل لهذا اليوم (يشمل فواتير ما قبل الترحيل التي ليس لديها dayKey
    // لكن createdAt يقع ضمن اليوم التجاري بتوقيت القاهرة).
    // ملاحظة: الأرقام المستبعدة هنا تتجاوز الحد المعقول فقط — بذرة العداد
    // لازم تبدأ من رقم يومي حقيقي مش من رقم مهجور.
    const getMaxNumericForDay = async () => {
      const { start, end } = getBusinessDayRange(dayKey);
      const result = await orderModel.aggregate([
        {
          $match: {
            orderNumber: { $regex: `^[0-9]{1,${MAX_PLAUSIBLE_DIGITS}}$` },
            $or: [{ dayKey }, { dayKey: null, createdAt: { $gte: start, $lte: end } }],
          },
        },
        { $addFields: { orderNumberInt: { $toInt: "$orderNumber" } } },
        { $group: { _id: null, maxNum: { $max: "$orderNumberInt" } } },
      ]);
      return result.length > 0 ? result[0].maxNum || 0 : 0;
    };

    // تصحيح العداد ليطابق أعلى رقم فعلي لليوم (حماية من استرجاع نسخة قديمة من القاعدة)
    const correctCounterToMax = async () => {
      try {
        const maxNum = await getMaxNumericForDay();
        if (maxNum > 0) {
          await invoiceCounterModel.updateOne(
            { _id: `invoice_${dayKey}` },
            { $max: { seq: maxNum } },
            { upsert: true }
          );
        }
      } catch {
        /* تجاهل — العداد يظل يعمل بقيمه الحالية */
      }
    };

    /**
     * شفاء ذاتي للعداد اليومي لو اتسمّم برقم غير منطقي.
     * فاتورة قديمة أو مسترجَعة رقمها 4-6 أرقام كانت بترفع العداد، فيلتصق
     * العداد بأرقام مثل 9607 → كل الفواتير الجديدة بتبقى بأرقام ضخمة.
     * هنا بنرجّع العداد لأعلى رقم *واقعي* في اليوم (بحد أقصى 3 أرقام).
     * @returns {boolean} true لو تم التصحيح
     */
    const healPoisonedCounter = async () => {
      try {
        const counter = await invoiceCounterModel.findById(`invoice_${dayKey}`).lean();
        const seq = Number(counter?.seq) || 0;
        if (seq <= MAX_PLAUSIBLE_DAILY_INVOICE) return false;
        const realMax = await getMaxNumericForDay();
        if (realMax >= seq) return false; // العداد سليم فعلاً
        await invoiceCounterModel.updateOne(
          { _id: `invoice_${dayKey}` },
          { $set: { seq: realMax } },
          { upsert: true }
        );
        return true;
      } catch {
        return false;
      }
    };

    // بذرة أول يوم: لو العداد لسه غير موجود، ابدأه من أعلى رقم موجود فعلاً
    // لنفس اليوم التجاري (حتى لا تتكرر أرقام فواتير أُنشئت قبل التحديث)
    try {
      const existingCounter = await invoiceCounterModel.findById(`invoice_${dayKey}`);
      if (!existingCounter) {
        await correctCounterToMax();
      } else {
        // العداد موجود بس ممكن يكون متسمّم برقم قديم غير منطقي (4+ أرقام)
        await healPoisonedCounter();
      }
    } catch {
      /* تجاهل — التخصيص العادي سيستمر */
    }

    // ===== PHASE 4: Create Order (السيرفر هو المصدر الوحيد للرقم النهائي) =====
    // قاعدة الترقيم النهائية:
    //  - رقم الفاتورة النهائي يُصدره السيرفر فقط من العداد اليومي الذري (1, 2, 3, ...).
    //  - لا يُقبل أي رقم من العميل: رقم الديسكتوب أوفلاين مؤقت فقط، وقد يتعارض مع أرقام
    //    أُصدرت من جهاز/كاشير آخر أثناء انقطاع النت → كان يسبب عدم تطابق الأرقام بين
    //    المنصة والديسكتوب وأرقاماً "بتزيد بشكل غلط".
    //  - req.body.orderNumber يُقبل في الـ validation للتوافق مع العملاء القدامى ويُتجاهل هنا.
    //  - التكرار ممنوع: الفهرس الفريد { dayKey, orderNumber } + إرجاع الفاتورة الموجودة
    //    عند تكرار نفس clientOrderId (بدون إنشاء نسخة ثانية).

    let newOrder = null;
    let attempts = 0;
    while (!newOrder && attempts < 5) {
      attempts++;
      let orderNumber = null;

      try {
        // تخصيص ذري: زوّد العداد وخذ القيمة الجديدة في عملية واحدة
        const counter = await invoiceCounterModel.findOneAndUpdate(
          { _id: `invoice_${dayKey}` },
          { $inc: { seq: 1 } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        orderNumber = String(counter?.seq || attempts);
      } catch {
        // fallback نادر: لو فشل العداد نستخدم أعلى رقم اليوم + المحاولة الحالية
        const maxNum = await getMaxNumericForDay();
        orderNumber = String(maxNum + attempts);
      }

      // حاجز أمان أخير: لو رجع رقم كبير غير منطقي (عداد مسمّم لسه)، نصححه ونطلب
      // رقم صحيح فوراً بدل حفظ الفاتورة برقم ضخم.
      if (Number(orderNumber) > MAX_PLAUSIBLE_DAILY_INVOICE) {
        await healPoisonedCounter();
        const realMax = await getMaxNumericForDay();
        orderNumber = String(realMax + 1);
      }

      try {
        newOrder = await orderModel.create({
          orderNumber,
          dayKey,
          items: processedItems,
          totalAmount: calculatedTotal,
          tableNumber,
          cashierId,
          status: orderStatuses.completed,
          notes: notes || "",
          clientOrderId: clientOrderId || undefined,
          // F4: فواتير الأوفلاين تحتفظ بوقت إنشائها الحقيقي (Mongoose يحترم createdAt
          // الممرر صراحةً مع timestamps:true). الطلبات Online تبقى بدون تغيير.
          ...(offlineCreatedAt ? { createdAt: offlineCreatedAt } : {}),
        });

        // مزامنة العداد مع أعلى رقم مستخدم لضمان استمرار التسلسل التصاعدي
        if (Number(orderNumber) > 0) {
          await invoiceCounterModel.updateOne(
            { _id: `invoice_${dayKey}` },
            { $max: { seq: Number(orderNumber) } },
            { upsert: true }
          );
        }
      } catch (err) {
        if (err.code === 11000) {
          // (1) نفس الفاتورة وصلت مرتين (إعادة محاولة بعد انقطاع النت أثناء استلام الرد،
          //     أو صف مكرر في طابور المزامنة) → نُعيد الفاتورة الموجودة بدون إنشاء نسخة
          //     ثانية حتى لا تتكرر الفاتورة في قاعدة البيانات الأساسية.
          const isDuplicateClientOp =
            Boolean(clientOrderId) &&
            (Boolean(err?.keyPattern?.clientOrderId) ||
              /clientOrderId/i.test(String(err?.message || "")));

          if (isDuplicateClientOp) {
            const alreadySynced = await orderModel
              .findOne({ clientOrderId })
              .populate("items.product", "name price image")
              .populate("cashierId", "userName email");

            if (alreadySynced) {
              return res.status(200).json({
                success: true,
                message: "Order already synced",
                data: alreadySynced,
              });
            }
          }

          // (2) تعارض نادر في رقم اليوم (مثلاً بعد استرجاع نسخة قديمة من القاعدة)
          //     → صحّح العداد ليطابق أعلى رقم فعلي وأعد المحاولة
          await correctCounterToMax();
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
  const { status, searchDate, cashierId, from, to } = req.query;
  const filter = {};

  if (status) filter.status = status;

  // Anti-theft rule: cashiers can only ever see their OWN orders.
  // Only admins are allowed to view/filter sales across all cashiers.
  if (req.user.roleType === roles.admin) {
    if (cashierId) filter.cashierId = cashierId;
  } else {
    filter.cashierId = req.user._id;
  }

  // F1: فلترة اليوم التجاري بتوقيت القاهرة (Africa/Cairo) — وليس timezone السيرفر.
  // searchDate: يوم تجاري واحد. from/to: نطاق أيام تجارية (اختياري — backward-compatible).
  if (searchDate || from || to) {
    const range = {};
    if (searchDate) {
      const { start, end } = getBusinessDayRange(getBusinessDayKey(new Date(searchDate)));
      range.$gte = start;
      range.$lte = end;
    } else {
      if (from) range.$gte = getBusinessDayRange(getBusinessDayKey(new Date(from))).start;
      if (to) range.$lte = getBusinessDayRange(getBusinessDayKey(new Date(to))).end;
    }
    filter.createdAt = range;
  }

  // تضييق الحقول المعبأة لتقليل حجم الاستجابة جذرياً (يمنع 413 من Vercel مع نمو البيانات)
  // — كل المستهلكين الحاليين يحتاجون name/price/image فقط، وgetOrder المفرد يبقى كامل الحقول
  const data = await orderModel.find(filter)
    .sort({ createdAt: -1 })
    .populate("items.product", "name price image")
    .populate("cashierId", "userName email")
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
        const invItem = await inventoryModel.findById(ing.inventoryItem);
        if (!invItem) continue;

        const stockBase = convertToBase(invItem.quantity, invItem.unit);
        const repaired = repairIngredientInput(ing, stockBase);
        const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;

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
  const { items, tableNumber, notes } = req.body;

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
        const stockBase = convertToBase(invItem.quantity, invItem.unit);
        const repaired = repairIngredientInput(ing, stockBase);
        const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity);
        const totalConsumptionBase = cpu * item.quantity;
        const currentStockBase = convertToBase(invItem.quantity, invItem.unit);

        const isPrimary = ing.isPrimary !== false;

        if (isPrimary && currentStockBase < totalConsumptionBase) {
          await restoreOrderQuantities(order);
          const canMake = Math.floor(currentStockBase / cpu);
          return next(new Error(
            `رصيد خامة "${invItem.name}" غير كافٍ. الكمية المتاحة تكفي ${canMake} كوب فقط.`,
            { cause: 400 }
          ));
        }

        const existing = inventoryDeductions.find(
          (d) => d.inventoryId.toString() === invItem._id.toString()
        );
        if (existing) {
          existing.consumptionBase += totalConsumptionBase;
          if (isPrimary) existing.isPrimary = true;
        } else {
          inventoryDeductions.push({
            inventoryId: invItem._id,
            currentQuantity: invItem.quantity,
            currentUnit: invItem.unit,
            consumptionBase: totalConsumptionBase,
            isPrimary,
          });
        }
      }
    }

    // Re-validate merged deductions for shared ingredients (PRIMARY only)
    for (const ded of inventoryDeductions) {
      if (!ded.isPrimary) continue;
      const currentStockBase = convertToBase(ded.currentQuantity, ded.currentUnit);
      if (currentStockBase < ded.consumptionBase) {
        await restoreOrderQuantities(order);
        const invItem = await inventoryModel.findById(ded.inventoryId);
        return next(new Error(
          `رصيد خامة "${invItem?.name}" غير كافٍ لتغطية إجمالي الطلب.`,
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
        const invItem = await inventoryModel.findById(ing.inventoryItem);
        if (invItem) {
          const stockBase = convertToBase(invItem.quantity, invItem.unit);
          const repaired = repairIngredientInput(ing, stockBase);
          const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity);
          const totalConsumptionBase = cpu * item.quantity;
          const currentStockBase = convertToBase(invItem.quantity, invItem.unit);
          const restoredBase = Math.max(0, currentStockBase - totalConsumptionBase);
          const restoredQty = baseToUnit(restoredBase, invItem.unit);
          await inventoryModel.findByIdAndUpdate(ing.inventoryItem, { quantity: restoredQty });
        }
      }
    }
  }
};