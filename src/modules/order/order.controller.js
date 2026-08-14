import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as orderValidation from "./order.validation.js";
import * as orderService from "./order.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// ===================== Create Order (POS Sale) =====================
router.post(
  "/",
  authAction,
  validation(orderValidation.createOrderSchema),
  asyncHandler(orderService.createOrder)
);

// ===================== Get Orders =====================
router.get(
  "/",
  authAction,
  asyncHandler(orderService.getOrders)
);

// ===================== Get Order =====================
router.get(
  "/:id",
  authAction,
  validation(orderValidation.getOrderSchema),
  asyncHandler(orderService.getOrder)
);

// ===================== Update Order Status =====================
router.patch(
  "/:id/status",
  authAction,
  authorization([roles.admin, roles.manager]),
  validation(orderValidation.updateOrderStatusSchema),
  asyncHandler(orderService.updateOrderStatus)
);

export default router;
