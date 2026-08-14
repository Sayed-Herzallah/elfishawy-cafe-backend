import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as inventoryValidation from "./inventory.validation.js";
import * as inventoryService from "./inventory.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// Set protections for all routes under inventory (restricted to Admin)
router.use(authAction, authorization([roles.admin]));

// ===================== Create Item =====================
router.post(
  "/",
  validation(inventoryValidation.createInventorySchema),
  asyncHandler(inventoryService.createItem)
);

// ===================== List Inventory =====================
router.get(
  "/",
  asyncHandler(inventoryService.listInventory)
);

// ===================== Restock Item =====================
router.patch(
  "/:id/restock",
  validation(inventoryValidation.restockInventorySchema),
  asyncHandler(inventoryService.restockItem)
);

// ===================== Delete Item =====================
router.delete(
  "/:id",
  validation(inventoryValidation.deleteInventorySchema),
  asyncHandler(inventoryService.deleteItem)
);

export default router;
