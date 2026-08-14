import joi from "joi";
import mongoose from "mongoose";

// ================= Validation Middleware ======================
export const validation = (schema) => {
  return (req, res, next) => {
    const data = { ...req.body, ...req.params, ...req.query };

    if (req.files?.length) {
      data.file = req.files; // array check (joi.array())
    } else if (req.file) {
      data.file = [req.file];
    }

    const result = schema.validate(data, { abortEarly: false });
    if (result.error) {
      return next({
        message: "Validation Error",
        details: result.error.details.map((obj) => obj.message),
        cause: 400,
      });
    }
    
    return next();
  };
};

// ================= Check Mongoose ID ======================
export const monggoseID = (name = "ID") => joi.string().custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value))
        return helpers.error("any.invalid");
      return value;
    })
    .messages({
      "string.empty": `${name} is required`,
      "any.required": `${name} is required`,
      "any.invalid": `Invalid ${name}`,
    });

// ================= Check File ======================
export const checkFile = (allowedMimetypes = []) =>
  joi.array().items(
    joi.object({
      mimetype: joi
        .string()
        .valid(...allowedMimetypes)
        .required()
        .messages({
          "any.only": `Only ${allowedMimetypes.join(", ")} are allowed`,
        }),
      size: joi
        .number()
        .max(5 * 1024 * 1024)
        .required()
        .messages({
          "number.max": "File size must not exceed 5MB",
        }),
      encoding: joi.string().required(),
      originalname: joi.string().required(),
      fieldname: joi.string(),
      buffer: joi.any(),
      path: joi.string(),
      filename: joi.string(),
      destination: joi.string(),
    })
  );
