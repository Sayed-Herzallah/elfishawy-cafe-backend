import joi from "joi";
import { monggoseID, checkFile } from "../../middleware/validation.middleware.js";

const mimetypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export const createProductSchema = joi.object({
  name: joi.string().min(2).max(50).trim().required()
    .messages({
      "string.empty": "Product name is required",
      "string.min": "Product name must be at least 2 characters",
      "string.max": "Product name must not exceed 50 characters",
      "any.required": "Product name is required",
    }),
  description: joi.string().min(2).max(300).trim().required()
    .messages({
      "string.empty": "Product description is required",
      "string.min": "Product description must be at least 2 characters",
      "string.max": "Product description must not exceed 300 characters",
      "any.required": "Product description is required",
    }),
  price: joi.number().min(0).required()
    .messages({
      "number.min": "Price cannot be negative",
      "any.required": "Price is required",
    }),
  category: monggoseID("Category ID").required(),
  stockQuantity: joi.number().integer().min(0).default(0),
  file: checkFile(mimetypes)
    .required()
    .messages({
      "any.required": "Product image is required (upload an image with 'image' field)",
      "array.includesRequiredUnknowns": "Product image is required",
    }),
}).required();

export const updateProductSchema = joi.object({
  id: monggoseID("Product ID").required(),
  name: joi.string().min(2).max(50).trim().optional(),
  description: joi.string().max(300).optional(),
  price: joi.number().min(0).optional(),
  category: monggoseID("Category ID").optional(),
  stockQuantity: joi.alternatives().try(
    joi.number().integer().min(0),
    joi.string().pattern(/^\d+(\.\d+)?$/)
  ).optional(),
  inStock: joi.alternatives().try(
    joi.boolean(),
    joi.string().valid("true", "false")
  ).optional(),
  file: checkFile(mimetypes).optional(),
}).required();

export const deleteProductSchema = joi.object({
  id: monggoseID("Product ID").required(),
}).required();

export const getProductSchema = joi.object({
  id: monggoseID("Product ID").required(),
}).required();
