import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as categoryValidation from "./category.validation.js";
import * as categoryService from "./category.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// ===================== Create Category =====================
router.post(
  "/",
  authAction,
  authorization([roles.admin]),
  validation(categoryValidation.createCategorySchema),
  asyncHandler(categoryService.createCategory)
);

// ===================== Get Categories =====================
router.get(
  "/",
  authAction,
  asyncHandler(categoryService.listCategories)
);

// ===================== Update Category =====================
router.put(
  "/:id",
  authAction,
  authorization([roles.admin]),
  validation(categoryValidation.updateCategorySchema),
  asyncHandler(categoryService.updateCategory)
);

// ===================== Delete Category =====================
router.delete(
  "/:id",
  authAction,
  authorization([roles.admin]),
  validation(categoryValidation.deleteCategorySchema),
  asyncHandler(categoryService.deleteCategory)
);

export default router;
