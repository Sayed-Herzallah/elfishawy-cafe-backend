import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import * as syncService from "./sync.service.js";

const router = Router();

router.use(authAction);

// Push batch offline operations (Orders, Restocks, Expenses)
router.post("/push", asyncHandler(syncService.processBatchPush));

// Pull fresh catalog & snapshot for offline cache
router.get("/pull-catalog", asyncHandler(syncService.pullCatalog));

export default router;
