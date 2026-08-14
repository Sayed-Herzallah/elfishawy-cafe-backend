import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import * as authValidation from "./auth.validation.js";
import * as authService from "./auth.service.js";
import { validation } from "../../middleware/validation.middleware.js";

const router = Router();

// ===================== Login =====================
router.post("/login", validation(authValidation.loginSchema), asyncHandler(authService.login));

// ===================== Refresh Token =====================
router.post("/refreshToken", validation(authValidation.refreshTokenSchema), asyncHandler(authService.refreshToken));

export default router;
