import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as expenseValidation from "./expense.validation.js";
import * as expenseService from "./expense.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// All expense routes require login; per-route rules below decide who can do what.
router.use(authAction);

// ===================== Create Expense =====================
// Cashier can log an expense (e.g. buying milk on the spot), but the SERVICE
// layer restricts a cashier's entries to category "inventory" only — they
// have no legitimate reason to log "salaries" or "rent".
router.post(
  "/",
  authorization([roles.admin, roles.cashier]),
  validation(expenseValidation.createExpenseSchema),
  asyncHandler(expenseService.createExpense)
);

// ===================== List Expenses =====================
// Anti-theft rule: a cashier only ever sees the expenses THEY logged, never
// the full expense list — full visibility would let them add up total costs
// and back into the shop's profit margin. Only the admin sees everything.
router.get(
  "/",
  authorization([roles.admin, roles.cashier]),
  asyncHandler(expenseService.listExpenses)
);

// ===================== Update Expense =====================
router.patch(
  "/:id",
  authorization([roles.admin]),
  validation(expenseValidation.updateExpenseSchema),
  asyncHandler(expenseService.updateExpense)
);

// ===================== Delete Expense =====================
// Admin only — deleting an expense also rolls back inventory quantity, and
// letting a cashier erase entries (their own or anyone else's) would let
// them cover up tampering.
router.delete(
  "/:id",
  authorization([roles.admin]),
  validation(expenseValidation.deleteExpenseSchema),
  asyncHandler(expenseService.deleteExpense)
);

export default router;
