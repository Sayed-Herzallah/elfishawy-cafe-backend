import { recipeModel } from "../../database/model/recipe.model.js";
import { productModel } from "../../database/model/product.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { consumptionPerUnit, convertToBase } from "./unitConverter.js";

const OUT_OF_STOCK_EPSILON = 0.01;

const isStockOut = (quantity) => (Number(quantity) || 0) <= OUT_OF_STOCK_EPSILON;

/**
 * Calculate sellable product units from a recipe and current inventory map.
 */
export const calcAvailableFromRecipe = (recipe, inventoryById) => {
  if (!recipe?.ingredients?.length) return null;

  let minAvailable = Infinity;

  for (const ing of recipe.ingredients) {
    const invRef = ing.inventoryItem;
    const invId =
      typeof invRef === "object" && invRef?._id
        ? invRef._id.toString()
        : invRef?.toString?.() || String(invRef);

    const invItem =
      (typeof invRef === "object" && invRef?.quantity !== undefined ? invRef : null) ||
      inventoryById.get(invId);

    if (!invItem || isStockOut(invItem.quantity)) return 0;

    const cpu = consumptionPerUnit(
      ing.inputQuantity,
      ing.inputUnit,
      ing.outputQuantity || 1
    );
    const stockBase = convertToBase(invItem.quantity, invItem.unit);
    const available = cpu > 0 ? Math.floor(stockBase / cpu) : Infinity;
    minAvailable = Math.min(minAvailable, available);
  }

  return Number.isFinite(minAvailable) ? minAvailable : 0;
};

const applyProductStock = async (productId, newQty) => {
  const product = await productModel.findById(productId);
  if (!product) return false;

  const nextInStock = newQty > 0;
  const needsUpdate =
    product.stockQuantity !== newQty || product.inStock !== nextInStock;

  if (!needsUpdate) return false;

  product.stockQuantity = newQty;
  product.inStock = nextInStock;
  await product.save();
  return true;
};

/**
 * After restocking/updating a raw inventory item, recalculate linked product stock.
 */
export const syncProductsForInventoryItem = async (inventoryItemId) => {
  const recipes = await recipeModel
    .find({ "ingredients.inventoryItem": inventoryItemId, isActive: true })
    .populate("ingredients.inventoryItem", "quantity unit");

  if (!recipes.length) return 0;

  const allInventory = await inventoryModel.find({}).lean();
  const inventoryById = new Map(allInventory.map((i) => [i._id.toString(), i]));

  let updatedCount = 0;

  for (const recipe of recipes) {
    if (!recipe.product) continue;

    const newQty = calcAvailableFromRecipe(recipe, inventoryById);
    if (newQty === null) continue;

    const updated = await applyProductStock(recipe.product, newQty);
    if (updated) updatedCount++;
  }

  return updatedCount;
};

/** Recalculate one product from its active recipe. */
export const syncProductById = async (productId) => {
  const recipe = await recipeModel
    .findOne({ product: productId, isActive: true })
    .populate("ingredients.inventoryItem", "quantity unit");

  if (!recipe) return false;

  const allInventory = await inventoryModel.find({}).lean();
  const inventoryById = new Map(allInventory.map((i) => [i._id.toString(), i]));

  const newQty = calcAvailableFromRecipe(recipe, inventoryById);
  if (newQty === null) return false;

  return applyProductStock(productId, newQty);
};
