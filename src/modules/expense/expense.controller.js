import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as expenseValidation from "./expense.validation.js";
import * as expenseService from "./expense.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// Protect all routes under expenses (restricted to Admin)
router.use(authAction, authorization([roles.admin]));

// ===================== Create Expense =====================
router.post(
  "/",
  validation(expenseValidation.createExpenseSchema),
  asyncHandler(expenseService.createExpense)
);

// ===================== List Expenses =====================
router.get(
  "/",
  asyncHandler(expenseService.listExpenses)
);

// ===================== Delete Expense =====================
router.delete(
  "/:id",
  validation(expenseValidation.deleteExpenseSchema),
  asyncHandler(expenseService.deleteExpense)
);

export default router;
