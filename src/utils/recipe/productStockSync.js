import { recipeModel } from "../../database/model/recipe.model.js";
import { productModel } from "../../database/model/product.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import {
  consumptionPerUnit,
  convertToBase,
  repairIngredientInput,
} from "./unitConverter.js";

const OUT_OF_STOCK_EPSILON = 0.01;

const isStockOut = (quantity) => (Number(quantity) || 0) <= OUT_OF_STOCK_EPSILON;

const resolveInventoryItem = (invRef, inventoryById) => {
  const invId =
    typeof invRef === "object" && invRef?._id
      ? invRef._id.toString()
      : invRef?.toString?.() || String(invRef);

  if (typeof invRef === "object" && invRef?.quantity !== undefined) {
    return { item: invRef, id: invId };
  }

  return { item: inventoryById.get(invId), id: invId };
};

/**
 * Calculate sellable product units from a recipe and current inventory map.
 * Optionally repairs corrupted ingredient rows on the recipe document.
 */
export const calcAvailableFromRecipe = (recipe, inventoryById, { persistRepair = false } = {}) => {
  if (!recipe?.ingredients?.length) return null;

  let minAvailable = Infinity;
  let recipeDirty = false;

  for (const ing of recipe.ingredients) {
    const { item: invItem } = resolveInventoryItem(ing.inventoryItem, inventoryById);
    if (!invItem || isStockOut(invItem.quantity)) return 0;

    const stockBase = convertToBase(invItem.quantity, invItem.unit);
    const repaired = repairIngredientInput(ing, stockBase);

    if (repaired.repaired && persistRepair) {
      ing.inputQuantity = repaired.inputQuantity;
      ing.inputUnit = repaired.inputUnit;
      recipeDirty = true;
    }

    const cpu = consumptionPerUnit(
      repaired.inputQuantity,
      repaired.inputUnit,
      ing.outputQuantity || 1
    );
    const available = cpu > 0 ? Math.floor(stockBase / cpu) : Infinity;
    minAvailable = Math.min(minAvailable, available);
  }

  if (persistRepair && recipeDirty && typeof recipe.save === "function") {
    recipe.markModified("ingredients");
    recipe.save().catch(() => {});
  }

  return Number.isFinite(minAvailable) ? minAvailable : 0;
};

const applyProductStock = async (productId, newQty) => {
  const product = await productModel.findById(productId);
  if (!product) return false;

  const safeQty = Math.max(0, Math.floor(Number(newQty) || 0));
  const nextInStock = safeQty > 0;
  const needsUpdate =
    product.stockQuantity !== safeQty || product.inStock !== nextInStock;

  if (!needsUpdate) return false;

  product.stockQuantity = safeQty;
  product.inStock = nextInStock;
  await product.save();
  return true;
};

/**
 * After restocking/updating a raw inventory item, recalculate linked product stock.
 */
export const syncProductsForInventoryItem = async (inventoryItemId) => {
  const id = String(inventoryItemId);

  const recipes = await recipeModel
    .find({ "ingredients.inventoryItem": id })
    .populate("ingredients.inventoryItem", "quantity unit");

  if (!recipes.length) return 0;

  const allInventory = await inventoryModel.find({}).lean();
  const inventoryById = new Map(allInventory.map((i) => [i._id.toString(), i]));

  let updatedCount = 0;

  for (const recipe of recipes) {
    if (!recipe.product || recipe.isActive === false) continue;

    const newQty = calcAvailableFromRecipe(recipe, inventoryById, { persistRepair: true });
    if (newQty === null) continue;

    const updated = await applyProductStock(recipe.product, newQty);
    if (updated) updatedCount++;
  }

  return updatedCount;
};

/** Recalculate one product from its active recipe. */
export const syncProductById = async (productId) => {
  const recipe = await recipeModel
    .findOne({ product: productId, isActive: { $ne: false } })
    .populate("ingredients.inventoryItem", "quantity unit");

  if (!recipe) return false;

  const allInventory = await inventoryModel.find({}).lean();
  const inventoryById = new Map(allInventory.map((i) => [i._id.toString(), i]));

  const newQty = calcAvailableFromRecipe(recipe, inventoryById, { persistRepair: true });
  if (newQty === null) return false;

  return applyProductStock(productId, newQty);
};

/** Sync every recipe-linked product — useful on startup / admin refresh. */
export const syncAllRecipeLinkedProducts = async () => {
  const recipes = await recipeModel
    .find({ isActive: { $ne: false } })
    .populate("ingredients.inventoryItem", "quantity unit");

  if (!recipes.length) return 0;

  const allInventory = await inventoryModel.find({}).lean();
  const inventoryById = new Map(allInventory.map((i) => [i._id.toString(), i]));

  let updatedCount = 0;

  for (const recipe of recipes) {
    if (!recipe.product) continue;

    const newQty = calcAvailableFromRecipe(recipe, inventoryById, { persistRepair: true });
    if (newQty === null) continue;

    const updated = await applyProductStock(recipe.product, newQty);
    if (updated) updatedCount++;
  }

  return updatedCount;
};
