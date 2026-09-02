import joi from "joi";

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.(com|net|edu)$/;
const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/;

export const loginSchema = joi.object({
  email: joi.string().pattern(emailRegex).lowercase().trim().required()
    .messages({
      "string.empty": "Email is required",
      "string.pattern.base": "Invalid email format (must be .com, .net, or .edu)",
      "any.required": "Email is required",
    }),
  password: joi.string().min(16).pattern(passwordRegex).required()
    .messages({
      "string.empty": "Password is required",
      "string.min": "Password must be at least 8 characters",
      "string.pattern.base": "Password must contain uppercase, lowercase, and a number",
      "any.required": "Password is required",
    }),
}).required();

export const refreshTokenSchema = joi.object({
  refreshToken: joi.string().required()
    .messages({
      "string.empty": "Refresh token is required",
      "any.required": "Refresh token is required",
    }),
}).required();
