import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as userValidation from "./user.validation.js";
import * as userService from "./user.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// ===================== Create Staff (Admin) =====================
router.post(
  "/",
  authAction,
  authorization([roles.admin]),
  validation(userValidation.createUserSchema),
  asyncHandler(userService.createStaff)
);

// ===================== Get Staff List (Admin) =====================
router.get(
  "/",
  authAction,
  authorization([roles.admin]),
  asyncHandler(userService.listStaff)
);

// ===================== Get Profile (Me) =====================
router.get(
  "/me",
  authAction,
  asyncHandler(userService.getMe)
);

// ===================== Update Profile (Me) =====================
router.patch(
  "/me",
  authAction,
  validation(userValidation.updateProfileSchema),
  asyncHandler(userService.updateMe)
);

// ===================== Delete Staff (Admin only) =====================
router.delete(
  "/:id",
  authAction,
  authorization([roles.admin]),
  validation(userValidation.deleteUserSchema),
  asyncHandler(userService.deleteStaff)
);

export default router;
