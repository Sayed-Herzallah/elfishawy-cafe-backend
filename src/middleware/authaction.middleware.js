import jwt from "jsonwebtoken";
import { userModel } from "../database/model/user.model.js";

const authAction = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return next(new Error("unauthorized token not found", { cause: 401 }));

  const partialDecoded = jwt.decode(authorization);
  if (!partialDecoded?.id) return next(new Error("invalid token", { cause: 401 }));

  const user = await userModel.findById(partialDecoded.id);
  if (!user) return next(new Error("unauthorized user not found", { cause: 401 }));

  try {
    jwt.verify(authorization, process.env.ACCESS_SECRET + user.createdAt.getTime());
  } catch (err) {
    return next(new Error("Invalid or expired token", { cause: 401 }));
  }

  if (user.passwordChangedAt) {
    const decoded = jwt.decode(authorization);
    if (decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
      return next(new Error("Token expired, please login again", { cause: 401 }));
    }
  }

  if (!user.verify) return next(new Error("verify your account", { cause: 401 }));

  req.user = user;
  return next();
};

export default authAction;
