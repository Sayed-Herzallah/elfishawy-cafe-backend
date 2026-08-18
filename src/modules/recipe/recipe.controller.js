import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as recipeValidation from "./recipe.validation.js";
import * as recipeService from "./recipe.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// ===================== Create Recipe (Admin only) =====================
router.post(
  "/",
  authAction,
  authorization([roles.admin]),
  validation(recipeValidation.createRecipeSchema),
  asyncHandler(recipeService.createRecipe)
);

// ===================== List All Recipes =====================
router.get(
  "/",
  authAction,
  asyncHandler(recipeService.listRecipes)
);

// ===================== Get Recipe by Product ID =====================
router.get(
  "/product/:productId",
  authAction,
  validation(recipeValidation.getRecipeByProductSchema),
  asyncHandler(recipeService.getRecipeByProduct)
);

// ===================== Get Recipe by ID =====================
router.get(
  "/:id",
  authAction,
  validation(recipeValidation.getRecipeSchema),
  asyncHandler(recipeService.getRecipe)
);

// ===================== Update Recipe (Admin only) =====================
router.patch(
  "/:id",
  authAction,
  authorization([roles.admin]),
  validation(recipeValidation.updateRecipeSchema),
  asyncHandler(recipeService.updateRecipe)
);

// ===================== Delete Recipe (Admin only) =====================
router.delete(
  "/:id",
  authAction,
  authorization([roles.admin]),
  validation(recipeValidation.deleteRecipeSchema),
  asyncHandler(recipeService.deleteRecipe)
);

export default router;
