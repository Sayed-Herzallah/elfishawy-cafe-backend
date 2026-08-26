import { recipeModel } from "../../database/model/recipe.model.js";
import { productModel } from "../../database/model/product.model.js";
import { inventoryModel } from "../../database/model/inventory.model.js";
import { consumptionPerUnit, availableFromStock, repairIngredientInput, convertToBase } from "../../utils/recipe/unitConverter.js";
import { syncProductById } from "../../utils/recipe/productStockSync.js";

// =========================== 1) Create Recipe ===========================
export const createRecipe = async (req, res, next) => {
  const { product, ingredients, isActive } = req.body;

  // Validate product exists
  const productExists = await productModel.findById(product);
  if (!productExists) return next(new Error("Product not found", { cause: 404 }));

  // Check no existing recipe for this product
  const existing = await recipeModel.findOne({ product });
  if (existing) return next(new Error("A recipe already exists for this product. Use PATCH to update it.", { cause: 409 }));

  // Validate all inventory items exist
  for (const ing of ingredients) {
    const item = await inventoryModel.findById(ing.inventoryItem);
    if (!item) return next(new Error(`Inventory item not found: ${ing.inventoryItem}`, { cause: 404 }));
  }

  const newRecipe = await recipeModel.create({ product, ingredients, isActive });

  try {
    await syncProductById(product);
  } catch {
    // تحسيني
  }

  const populated = await recipeModel.findById(newRecipe._id)
    .populate("product", "name price")
    .populate("ingredients.inventoryItem", "name unit quantity");

  return res.status(201).json({
    success: true,
    message: "Recipe created successfully",
    data: populated,
  });
};

// =========================== 2) List Recipes ===========================
export const listRecipes = async (req, res, next) => {
  const recipes = await recipeModel.find({})
    .populate("product", "name price inStock")
    .populate("ingredients.inventoryItem", "name unit quantity")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    message: "Recipes retrieved successfully",
    data: recipes,
  });
};

// =========================== 3) Get Recipe By ID ===========================
export const getRecipe = async (req, res, next) => {
  const { id } = req.params;

  const recipe = await recipeModel.findById(id)
    .populate("product", "name price inStock")
    .populate("ingredients.inventoryItem", "name unit quantity");

  if (!recipe) return next(new Error("Recipe not found", { cause: 404 }));

  return res.status(200).json({
    success: true,
    message: "Recipe retrieved successfully",
    data: recipe,
  });
};

// =========================== 4) Get Recipe By Product ID ===========================
export const getRecipeByProduct = async (req, res, next) => {
  const { productId } = req.params;

  const recipe = await recipeModel.findOne({ product: productId })
    .populate("product", "name price inStock")
    .populate("ingredients.inventoryItem", "name unit quantity");

  if (!recipe) return next(new Error("No recipe found for this product", { cause: 404 }));

  // Calculate available quantity from stock
  let availableQty = Infinity;
  const ingredientDetails = [];

  for (const ing of recipe.ingredients) {
    const invItem = ing.inventoryItem;
    const stockBase = convertToBase(invItem.quantity, invItem.unit);
    const repaired = repairIngredientInput(ing, stockBase);
    const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity);
    const available = availableFromStock(invItem.quantity, invItem.unit, cpu);
    ingredientDetails.push({
      inventoryItem: invItem,
      inputQuantity: repaired.inputQuantity,
      inputUnit: repaired.inputUnit,
      outputQuantity: ing.outputQuantity,
      consumptionPerUnitInBase: cpu,
      availableFromThisIngredient: available,
    });
    if (available < availableQty) availableQty = available;
  }

  return res.status(200).json({
    success: true,
    message: "Recipe retrieved successfully",
    data: {
      recipe,
      availableProductQty: availableQty === Infinity ? 0 : availableQty,
      ingredientDetails,
    },
  });
};

// =========================== 5) Update Recipe ===========================
export const updateRecipe = async (req, res, next) => {
  const { id } = req.params;
  const { ingredients, isActive } = req.body;

  const recipe = await recipeModel.findById(id);
  if (!recipe) return next(new Error("Recipe not found", { cause: 404 }));

  if (ingredients !== undefined) {
    // Validate all inventory items exist
    for (const ing of ingredients) {
      const item = await inventoryModel.findById(ing.inventoryItem);
      if (!item) return next(new Error(`Inventory item not found: ${ing.inventoryItem}`, { cause: 404 }));
    }
    recipe.ingredients = ingredients;
  }

  if (isActive !== undefined) recipe.isActive = isActive;

  await recipe.save();

  try {
    await syncProductById(recipe.product);
  } catch {
    // تحسيني
  }

  const updated = await recipeModel.findById(id)
    .populate("product", "name price")
    .populate("ingredients.inventoryItem", "name unit quantity");

  return res.status(200).json({
    success: true,
    message: "Recipe updated successfully",
    data: updated,
  });
};

// =========================== 6) Delete Recipe ===========================
export const deleteRecipe = async (req, res, next) => {
  const { id } = req.params;

  const recipe = await recipeModel.findById(id);
  if (!recipe) return next(new Error("Recipe not found", { cause: 404 }));

  await recipeModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: "Recipe deleted successfully",
  });
};
