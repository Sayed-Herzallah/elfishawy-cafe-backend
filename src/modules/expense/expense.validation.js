import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

export const createExpenseSchema = joi.object({
  description: joi.string().min(3).max(100).trim().required()
    .messages({
      "string.empty": "Description is required",
      "string.min": "Description must be at least 3 characters",
      "string.max": "Description must not exceed 100 characters",
      "any.required": "Description is required",
    }),
  amount: joi.number().min(0).required()
    .messages({
      "number.min": "Amount cannot be negative",
      "any.required": "Amount is required",
    }),
  category: joi.string().valid("rent", "salaries", "utilities", "inventory", "other").default("other")
    .messages({
      "any.only": "Invalid category choice",
    }),
  inventoryItemLinked: monggoseID("Inventory Item ID").when("category", {
    is: "inventory",
    then: joi.required(),
    otherwise: joi.optional().allow(null),
  }).messages({
    "any.required": "Linked inventory item is required for inventory category",
  }),
  inventoryQuantityAdded: joi.number().min(0.1).when("category", {
    is: "inventory",
    then: joi.required(),
    otherwise: joi.optional().allow(null),
  }).messages({
    "any.required": "Added quantity is required for inventory category",
  }),
  totalCost: joi.number().min(0).when("category", {
    is: "inventory",
    then: joi.required(),
    otherwise: joi.optional().allow(null),
  }).messages({
    "number.min": "Total cost cannot be negative",
    "any.required": "Total cost is required for inventory category",
  }),
  date: joi.date().optional(),
}).required();

export const deleteExpenseSchema = joi.object({
  id: monggoseID("Expense ID").required(),
}).required();

export const updateExpenseSchema = joi.object({
  id: monggoseID("Expense ID").required(),
  description: joi.string().min(3).max(100).trim().optional()
    .messages({
      "string.min": "Description must be at least 3 characters",
      "string.max": "Description must not exceed 100 characters",
    }),
  amount: joi.number().min(0).optional()
    .messages({
      "number.min": "Amount cannot be negative",
    }),
  category: joi.string().valid("rent", "salaries", "utilities", "inventory", "other").optional()
    .messages({
      "any.only": "Invalid category choice",
    }),
  inventoryItemLinked: monggoseID("Inventory Item ID").optional().allow(null),
  inventoryQuantityAdded: joi.number().min(0.1).optional().allow(null),
  totalCost: joi.number().min(0).optional().allow(null)
    .messages({
      "number.min": "Total cost cannot be negative",
    }),
  date: joi.date().optional(),
}).required();
