import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import * as analyticsService from "./analytics.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// Protect all analytics endpoints (restricted to Admin)
router.use(authAction, authorization([roles.admin]));

// ===================== Get KPIs / Stats =====================
router.get("/stats", asyncHandler(analyticsService.getStats));

// ===================== Get Charts Data =====================
router.get("/charts", asyncHandler(analyticsService.getCharts));

export default router;
