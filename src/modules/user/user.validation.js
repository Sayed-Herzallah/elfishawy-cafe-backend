import joi from "joi";

const nameRegex = /^[a-zA-Z\u0621-\u064A][^#&<>"~;$^%{}]{2,29}$/;
const phoneRegex = /^(002|\+2)?01[0125][0-9]{8}$/;

export const updateProfileSchema = joi.object({
  userName: joi.string().min(3).max(30).trim().pattern(nameRegex).optional(),
  phone: joi.string().pattern(phoneRegex).optional(),
  address: joi.string().max(100).optional(),
}).required();
