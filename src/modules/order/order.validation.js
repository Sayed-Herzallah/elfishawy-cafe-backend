import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

export const createOrderSchema = joi.object({
  items: joi.array().items(
    joi.object({
      product: monggoseID("Product ID").required(),
      quantity: joi.number().integer().min(1).required(),
      // F5: سعر البيع الفعلي وقت إنشاء الفاتورة الأوفلاين (اختياري — Online يظل بدون)
      price: joi.number().min(0).optional(),
    }).required()
  ).min(1).required()
    .messages({
      "array.min": "Order must contain at least one item",
    }),
  paymentMethod: joi.forbidden(),
  tableNumber: joi.number().integer().min(1).required()
    .messages({
      "any.required": "Table number is required",
    }),
  notes: joi.string().allow("").optional(),
  clientOrderId: joi.string().allow("").optional(),
  // F4: وقت الإنشاء الأصلي للفاتورة الأوفلاين المتزامنة (اختياري — يُقبل مع clientOrderId فقط)
  clientCreatedAt: joi.date().optional(),
}).required();

export const updateOrderStatusSchema = joi.object({
  id: monggoseID("Order ID").required(),
  status: joi.string().valid("pending", "completed", "cancelled").required()
    .messages({
      "any.only": "Invalid status value",
    }),
}).required();

export const getOrderSchema = joi.object({
  id: monggoseID("Order ID").required(),
}).required();

export const updateOrderSchema = joi.object({
  id: monggoseID("Order ID").required(),
  items: joi.array().items(
    joi.object({
      product: monggoseID("Product ID").required(),
      quantity: joi.number().integer().min(1).required(),
    }).required()
  ).min(1).optional()
    .messages({
      "array.min": "Order must contain at least one item",
    }),
  paymentMethod: joi.forbidden(),
  orderType: joi.forbidden(),
  tableNumber: joi.number().integer().min(1).optional().allow(null),
  notes: joi.string().allow("").optional(),
}).required();
