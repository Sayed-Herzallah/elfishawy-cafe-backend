import { Router } from "express";
import { asyncHandler } from "../../utils/errorhandling/asynchandler.js";
import authAction from "../../middleware/authaction.middleware.js";
import { authorization } from "../../middleware/authorization.middleware.js";
import { validation } from "../../middleware/validation.middleware.js";
import * as reservationValidation from "./reservation.validation.js";
import * as reservationService from "./reservation.service.js";
import { roles } from "../../database/model/user.model.js";

const router = Router();

// ===================== Create Reservation (Public / Staff) =====================
router.post(
  "/",
  validation(reservationValidation.createReservationSchema),
  asyncHandler(reservationService.createReservation)
);

// ===================== List Reservations (Staff only) =====================
router.get(
  "/",
  authAction,
  authorization([roles.admin, roles.manager, roles.cashier]),
  asyncHandler(reservationService.listReservations)
);

// ===================== Update Reservation Status (Staff only) =====================
router.patch(
  "/:id/status",
  authAction,
  authorization([roles.admin, roles.manager, roles.cashier]),
  validation(reservationValidation.updateReservationStatusSchema),
  asyncHandler(reservationService.updateReservationStatus)
);

export default router;
