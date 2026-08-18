import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as userValidation from "./user.validation.js";
import * as userService from "./user.service.js";

const router = Router();

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

export default router;
