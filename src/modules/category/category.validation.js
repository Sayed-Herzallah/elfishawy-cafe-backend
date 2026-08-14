import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

export const createCategorySchema = joi.object({
  name: joi.string().min(2).max(30).trim().required()
    .messages({
      "string.empty": "Category name is required",
      "string.min": "Name must be at least 2 characters",
      "string.max": "Name must not exceed 30 characters",
      "any.required": "Category name is required",
    }),
  description: joi.string().max(200).optional(),
}).required();

export const updateCategorySchema = joi.object({
  id: monggoseID("Category ID").required(),
  name: joi.string().min(2).max(30).trim().optional(),
  description: joi.string().max(200).optional(),
}).required();

export const deleteCategorySchema = joi.object({
  id: monggoseID("Category ID").required(),
}).required();
