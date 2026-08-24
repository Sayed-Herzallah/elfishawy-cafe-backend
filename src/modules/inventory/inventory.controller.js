import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as inventoryValidation from "./inventory.validation.js";
import * as inventoryService from "./inventory.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// All inventory routes require login; per-route rules below decide who can do what.
router.use(authAction);

// ===================== Create Item (Admin only) =====================
// Only the admin defines WHICH raw materials exist and their alert thresholds.
// A cashier must never be able to invent/rename items — that's how stock
// discrepancies get hidden ("ghost" items or renamed items).
router.post(
  "/",
  authorization([roles.admin]),
  validation(inventoryValidation.createInventorySchema),
  asyncHandler(inventoryService.createItem)
);

// ===================== List Inventory (Admin + Cashier) =====================
// Cashier can see stock levels — needed to receive deliveries / know what's
// out of stock. This does not expose cost/profit data (the model has none),
// so it does not create a new leak. Every item shows lastRestockedBy so the
// admin always knows, at a glance, who touched the stock — no manual audit work.
router.get(
  "/",
  authorization([roles.admin, roles.cashier]),
  asyncHandler(inventoryService.listInventory)
);

// ===================== Restock Item (Admin + Cashier) =====================
// Cashier can ADD stock when a delivery arrives. The validation schema only
// accepts a POSITIVE quantity, so this route can
//  only increase stock — a
// cashier can never use it to quietly reduce/zero-out stock to cover a theft.
// Every restock is stamped with who did it (lastRestockedBy) and when.
router.patch(
  "/:id/restock",
  authorization([roles.admin, roles.cashier]),
  validation(inventoryValidation.restockInventorySchema),
  asyncHandler(inventoryService.restockItem)
);

// ===================== Update Item (Admin only) =====================
router.patch(
  "/:id",
  authorization([roles.admin]),
  validation(inventoryValidation.updateInventorySchema),
  asyncHandler(inventoryService.updateItem)
);

// ===================== Delete Item (Admin only) =====================
// Deleting an item wipes its history — never allowed for a cashier, or they
// could erase the evidence of tampering.
router.delete(
  "/:id",
  authorization([roles.admin]),
  validation(inventoryValidation.deleteInventorySchema),
  asyncHandler(inventoryService.deleteItem)
);

export default router;
