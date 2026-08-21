import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

export const createOrderSchema = joi.object({
  items: joi.array().items(
    joi.object({
      product: monggoseID("Product ID").required(),
      quantity: joi.number().integer().min(1).required(),
    }).required()
  ).min(1).required()
    .messages({
      "array.min": "Order must contain at least one item",
    }),
  paymentMethod: joi.string().valid("cash", "card").default("cash"),
  orderType: joi.string().valid("dine-in", "takeaway").default("dine-in"),
  tableNumber: joi.number().integer().min(1).when("orderType", {
    is: "dine-in",
    then: joi.required(),
    otherwise: joi.optional().allow(null),
  }).messages({
    "any.required": "Table number is required for dine-in orders",
  }),
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
  paymentMethod: joi.string().valid("cash", "card").optional(),
  orderType: joi.string().valid("dine-in", "takeaway").optional(),
  tableNumber: joi.number().integer().min(1).optional().allow(null),
}).required();
