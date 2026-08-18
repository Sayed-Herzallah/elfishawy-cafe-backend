import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";
import { UNITS } from "../../utils/recipe/unitConverter.js";

const ingredientSchema = joi.object({
  inventoryItem: monggoseID("Inventory Item ID").required(),
  inputQuantity: joi.number().min(0.001).required()
    .messages({
      "number.min": "Input quantity must be greater than 0",
      "any.required": "Input quantity is required",
    }),
  inputUnit: joi.string().valid(...Object.values(UNITS)).uppercase().required()
    .messages({
      "any.only": `Unit must be one of: ${Object.values(UNITS).join(", ")}`,
      "any.required": "Input unit is required",
    }),
  outputQuantity: joi.number().integer().min(1).required()
    .messages({
      "number.min": "Output quantity must be at least 1",
      "any.required": "Output quantity is required",
    }),
});

export const createRecipeSchema = joi.object({
  product: monggoseID("Product ID").required(),
  ingredients: joi.array().items(ingredientSchema).min(1).required()
    .messages({
      "array.min": "Recipe must have at least one ingredient",
      "any.required": "Ingredients are required",
    }),
  isActive: joi.boolean().optional(),
}).required();

export const updateRecipeSchema = joi.object({
  id: monggoseID("Recipe ID").required(),
  ingredients: joi.array().items(ingredientSchema).min(1).optional(),
  isActive: joi.boolean().optional(),
}).required();

export const getRecipeSchema = joi.object({
  id: monggoseID("Recipe ID").required(),
}).required();

export const getRecipeByProductSchema = joi.object({
  productId: monggoseID("Product ID").required(),
}).required();

export const deleteRecipeSchema = joi.object({
  id: monggoseID("Recipe ID").required(),
}).required();
