import joi from "joi";
import { monggoseID } from "../../middleware/validation.middleware.js";

const nameRegex = /^[a-zA-Z\u0621-\u064A][^#&<>"~;$^%{}]{2,29}$/;
const phoneRegex = /^(002|\+2)?01[0125][0-9]{8}$/;
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.(com|net|edu)$/;
const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/;

export const createUserSchema = joi.object({
  userName: joi.string().min(3).max(30).trim().pattern(nameRegex).required()
    .messages({
      "string.empty": "Name is required",
      "string.min": "Name must be at least 3 characters",
      "string.max": "Name must not exceed 30 characters",
      "string.pattern.base": "Name must contain only letters",
      "any.required": "Name is required",
    }),
  email: joi.string().pattern(emailRegex).lowercase().trim().required()
    .messages({
      "string.empty": "Email is required",
      "string.pattern.base": "Invalid email format",
      "any.required": "Email is required",
    }),
  password: joi.string().min(8).pattern(passwordRegex).required()
    .messages({
      "string.empty": "Password is required",
      "string.min": "Password must be at least 8 characters",
      "string.pattern.base": "Password must contain uppercase, lowercase, and a number",
      "any.required": "Password is required",
    }),
  phone: joi.string().pattern(phoneRegex).required()
    .messages({
      "string.empty": "Phone is required",
      "string.pattern.base": "Invalid Egyptian phone number format",
      "any.required": "Phone is required",
    }),
  address: joi.string().max(100).optional(),
  roleType: joi.string().valid("admin", "manager", "cashier").required(),
}).required();

export const updateProfileSchema = joi.object({
  userName: joi.string().min(3).max(30).trim().pattern(nameRegex).optional(),
  phone: joi.string().pattern(phoneRegex).optional(),
  address: joi.string().max(100).optional(),
}).required();

export const deleteUserSchema = joi.object({
  id: monggoseID("User ID").required(),
}).required();
