import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import { uploadFile } from "../../utils/uploadfile/multer.js";
import * as productValidation from "./product.validation.js";
import * as productService from "./product.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// ===================== Create Product =====================
router.post(
  "/",
  authAction,
  authorization([roles.admin, roles.manager]),
  uploadFile().single("image"),
  validation(productValidation.createProductSchema),
  asyncHandler(productService.createProduct)
);

// ===================== Get Products =====================
router.get(
  "/",
  authAction,
  asyncHandler(productService.listProducts)
);

// ===================== Get Product =====================
router.get(
  "/:id",
  authAction,
  validation(productValidation.getProductSchema),
  asyncHandler(productService.getProduct)
);

// ===================== Update Product =====================
router.put(
  "/:id",
  authAction,
  authorization([roles.admin, roles.manager]),
  uploadFile().single("image"),
  validation(productValidation.updateProductSchema),
  asyncHandler(productService.updateProduct) // Wait, let's make sure it calls productService.updateProduct
);

// ===================== Delete Product =====================
router.delete(
  "/:id",
  authAction,
  authorization([roles.admin, roles.manager]),
  validation(productValidation.deleteProductSchema),
  asyncHandler(productService.deleteProduct)
);

export default router;
