import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

export const createInventorySchema = joi.object({
  name: joi.string().min(2).max(50).trim().required()
    .messages({
      "string.empty": "Inventory item name is required",
      "string.min": "Item name must be at least 2 characters",
      "string.max": "Item name must not exceed 50 characters",
      "any.required": "Inventory item name is required",
    }),
  quantity: joi.number().min(0).default(0),
  unit: joi.string().min(1).max(20).trim().required()
    .messages({
      "string.empty": "Unit is required",
      "any.required": "Unit is required",
    }),
  minLimit: joi.number().min(0).required()
    .messages({
      "number.min": "Minimum limit cannot be negative",
      "any.required": "Minimum limit is required",
    }),
  costPrice: joi.number().min(0).optional(),
  totalCost: joi.number().min(0).optional(),
}).required();

export const restockInventorySchema = joi.object({
  id: monggoseID("Inventory Item ID").required(),
  quantity: joi.number().positive().required()
    .messages({
      "number.positive": "Restock quantity must be positive",
      "any.required": "Restock quantity is required",
    }),
  totalCost: joi.number().min(0).required()
    .messages({
      "number.min": "Total cost cannot be negative",
      "any.required": "Total cost is required for restocking",
    }),
}).required();

export const deleteInventorySchema = joi.object({
  id: monggoseID("Inventory Item ID").required(),
}).required();

export const updateInventorySchema = joi.object({
  id: monggoseID("Inventory Item ID").required(),
  name: joi.string().min(2).max(50).trim().optional()
    .messages({
      "string.min": "Item name must be at least 2 characters",
      "string.max": "Item name must not exceed 50 characters",
    }),
  unit: joi.string().min(1).max(20).trim().optional(),
  minLimit: joi.number().min(0).optional()
    .messages({
      "number.min": "Minimum limit cannot be negative",
    }),
  costPrice: joi.number().min(0).optional()
    .messages({
      "number.min": "Cost price cannot be negative",
    }),
  totalCost: joi.number().min(0).optional(),
}).required();
