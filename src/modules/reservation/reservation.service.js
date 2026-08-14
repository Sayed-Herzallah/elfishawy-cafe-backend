import { reservationModel, reservationStatuses } from "../../database/model/reservation.model.js";
import { encryptPhone, decryptPhone } from "../../utils/encryption/encryption.js";

// =========================== 1) Create Reservation ===========================
export const createReservation = async (req, res, next) => {
  const { customerName, phone, tableNumber, guestCount, reservationTime } = req.body;

  // Double booking check (same table, ±2 hours, active status)
  const reqTime = new Date(reservationTime);
  const startTime = new Date(reqTime.getTime() - 2 * 60 * 60 * 1000);
  const endTime = new Date(reqTime.getTime() + 2 * 60 * 60 * 1000);

  const doubleBooking = await reservationModel.findOne({
    tableNumber: Number(tableNumber),
    status: { $ne: reservationStatuses.cancelled },
    reservationTime: {
      $gte: startTime,
      $lte: endTime,
    },
  });

  if (doubleBooking) {
    return next(new Error(`Table ${tableNumber} is already booked within this time window (±2 hours).`, { cause: 400 }));
  }

  const encryptedPhone = encryptPhone({ cipherText: phone });

  const newReservation = await reservationModel.create({
    customerName,
    phone: encryptedPhone,
    tableNumber: Number(tableNumber),
    guestCount: Number(guestCount),
    reservationTime: reqTime,
    status: reservationStatuses.pending,
  });

  const reservationData = {
    ...newReservation.toObject(),
    phone: decryptPhone({ cipherText: newReservation.phone }),
  };

  return res.status(201).json({
    success: true,
    message: "Table reserved successfully",
    data: reservationData,
  });
};

// =========================== 2) List Reservations ===========================
export const listReservations = async (req, res, next) => {
  const { status, tableNumber } = req.query;

  const filter = {};

  if (status) filter.status = status;
  if (tableNumber) filter.tableNumber = Number(tableNumber);

  const data = await reservationModel.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  // Decrypt phone numbers for all listed reservations
  const decryptedData = data.map((resv) => ({
    ...resv,
    phone: decryptPhone({ cipherText: resv.phone }),
  }));

  return res.status(200).json({
    success: true,
    message: "Reservations list retrieved successfully",
    data: decryptedData,
  });
};

// =========================== 3) Update Reservation Status ===========================
export const updateReservationStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const reservation = await reservationModel.findById(id);
  if (!reservation) return next(new Error("Reservation not found", { cause: 404 }));

  reservation.status = status;
  await reservation.save();

  const reservationData = {
    ...reservation.toObject(),
    phone: decryptPhone({ cipherText: reservation.phone }),
  };

  return res.status(200).json({
    success: true,
    message: "Reservation status updated successfully",
    data: reservationData,
  });
};
