import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

const phoneRegex = /^(002|\+2)?01[0125][0-9]{8}$/;

export const createReservationSchema = joi.object({
  customerName: joi.string().min(3).max(30).trim().required()
    .messages({
      "string.empty": "Customer name is required",
      "string.min": "Name must be at least 3 characters",
      "any.required": "Customer name is required",
    }),
  phone: joi.string().pattern(phoneRegex).required()
    .messages({
      "string.empty": "Phone number is required",
      "string.pattern.base": "Invalid phone format",
      "any.required": "Phone number is required",
    }),
  tableNumber: joi.number().integer().min(1).required()
    .messages({
      "number.min": "Table number must be positive",
      "any.required": "Table number is required",
    }),
  guestCount: joi.number().integer().min(1).required()
    .messages({
      "number.min": "Guest count must be at least 1",
      "any.required": "Guest count is required",
    }),
  reservationTime: joi.date().iso().required()
    .messages({
      "date.format": "Reservation time must be a valid ISO date",
      "any.required": "Reservation time is required",
    }),
}).required();

export const updateReservationStatusSchema = joi.object({
  id: monggoseID("Reservation ID").required(),
  status: joi.string().valid("pending", "confirmed", "cancelled").required()
    .messages({
      "any.only": "Invalid status value",
    }),
}).required();
