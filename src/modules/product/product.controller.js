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
  authorization([roles.admin]),
  uploadFile().single("image"),
  validation(productValidation.createProductSchema),
  asyncHandler(productService.createProduct)
);

// ===================== Public Menu (بدون تسجيل دخول — لزوار الموقع) =====================
// مهم: قبل راوت /:id عشان Express ميخدش "public" كـ id
router.get("/public/menu", asyncHandler(productService.listPublicMenu));

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
router.patch(
  "/:id",
  authAction,
  authorization([roles.admin]),
  uploadFile().single("image"),
  validation(productValidation.updateProductSchema),
  asyncHandler(productService.updateProduct)
);

// ===================== Delete Product =====================
router.delete(
  "/:id",
  authAction,
  authorization([roles.admin]),
  validation(productValidation.deleteProductSchema),
  asyncHandler(productService.deleteProduct)
);

export default router;
