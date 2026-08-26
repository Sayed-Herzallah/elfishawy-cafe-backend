// ===================== Unit Conversion System =====================
// Supported units and their base equivalents:
//   KG     → base: GRAM  (×1000)
//   GRAM   → base: GRAM  (×1)
//   LITER  → base: ML    (×1000)
//   ML     → base: ML    (×1)
//   PIECE  → base: PIECE (×1)

export const UNITS = {
  KG: "KG",
  GRAM: "GRAM",
  LITER: "LITER",
  ML: "ML",
  PIECE: "PIECE",
};

const CONVERSION_TO_BASE = {
  KG: 1000,
  GRAM: 1,
  LITER: 1000,
  ML: 1,
  PIECE: 1,
};

const BASE_UNIT = {
  KG: "GRAM",
  GRAM: "GRAM",
  LITER: "ML",
  ML: "ML",
  PIECE: "PIECE",
};

/**
 * Convert a quantity from a given unit to its base unit.
 * e.g. convertToBase(1, 'KG') → 1000 (GRAM)
 */
export const convertToBase = (quantity, unit) => {
  const factor = CONVERSION_TO_BASE[unit.toUpperCase()];
  if (factor === undefined) throw new Error(`Unsupported unit: ${unit}`);
  return quantity * factor;
};

/**
 * Get the base unit for a given unit.
 * e.g. getBaseUnit('KG') → 'GRAM'
 */
export const getBaseUnit = (unit) => {
  const base = BASE_UNIT[unit.toUpperCase()];
  if (!base) throw new Error(`Unsupported unit: ${unit}`);
  return base;
};

/**
 * Check if two units share the same base unit (are compatible).
 * e.g. isCompatible('KG', 'GRAM') → true
 * e.g. isCompatible('KG', 'LITER') → false
 */
export const isCompatible = (unitA, unitB) => {
  return getBaseUnit(unitA) === getBaseUnit(unitB);
};

/**
 * Calculate grams/ml/pieces consumed per unit sold.
 * Formula: convertToBase(inputQuantity, inputUnit) / outputQuantity
 * e.g. consumptionPerUnit(1, 'KG', 200) → 5 GRAM per cup
 */
export const consumptionPerUnit = (inputQuantity, inputUnit, outputQuantity) => {
  const baseInputQty = convertToBase(inputQuantity, inputUnit);
  return baseInputQty / outputQuantity;
};

/**
 * Calculate how many product units can be produced from available stock.
 * inventoryQty and inventoryUnit are the current stock.
 * cpuBase = consumptionPerUnit in base units.
 */
export const availableFromStock = (inventoryQty, inventoryUnit, cpuBase) => {
  if (cpuBase <= 0) return Infinity;
  const stockBase = convertToBase(inventoryQty, inventoryUnit);
  return Math.floor(stockBase / cpuBase);
};

/**
 * إصلاح نسبة الاستهلاك المفسدة (خطأ ×1000 الشائع):
 * - 20 كيلو محفوظة بدل 0.02 كيلo (20 جرام)
 * - 20 محفوظة ككيلo بدل 20 جرام
 */
export const repairIngredientInput = (ing, stockBase) => {
  const out = Number(ing.outputQuantity) > 0 ? Number(ing.outputQuantity) : 1;
  const unit = String(ing.inputUnit || "KG").toUpperCase();
  const qty = Number(ing.inputQuantity) || 0;

  if (qty <= 0 || stockBase <= 0) {
    return { inputQuantity: qty, inputUnit: unit, repaired: false };
  }

  const availableFor = (q, u) => {
    const cpu = consumptionPerUnit(q, u, out);
    return cpu > 0 ? Math.floor(stockBase / cpu) : 0;
  };

  if (availableFor(qty, unit) > 0) {
    return { inputQuantity: qty, inputUnit: unit, repaired: false };
  }

  if (unit === "KG" || unit === "LITER") {
    const divided = qty / 1000;
    if (divided >= 0.000001 && availableFor(divided, unit) > 0) {
      return { inputQuantity: divided, inputUnit: unit, repaired: true };
    }

    const subUnit = unit === "KG" ? "GRAM" : "ML";
    if (availableFor(qty, subUnit) > 0) {
      return { inputQuantity: qty, inputUnit: subUnit, repaired: true };
    }
  }

  return { inputQuantity: qty, inputUnit: unit, repaired: false };
};
