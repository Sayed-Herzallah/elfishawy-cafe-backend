import { userModel } from "../../database/model/user.model.js";
import { comparePassword } from "../../utils/hashing/hashing.js";
import { createToken, verifyToken } from "../../utils/token/token.js";

// =========================== 1) Login ===========================
export const login = async (req, res, next) => {
  const { email, password } = req.body;

  const user = await userModel.findOne({ email });
  if (!user) return next(new Error("Invalid email or password", { cause: 404 }));

  const isValid = comparePassword({ plainText: password, hashPassword: user.password });
  if (!isValid) return next(new Error("Invalid email or password", { cause: 401 }));

  if (!user.verify) return next(new Error("Please verify your email first", { cause: 403 }));

  const accessToken = createToken({
    payload: { id: user._id, roleType: user.roleType },
    secret: process.env.ACCESS_SECRET + user.createdAt.getTime(),
    options: { expiresIn: process.env.ACCESS_TOKEN },
  });

  const refreshToken = createToken({
    payload: { id: user._id, roleType: user.roleType },
    secret: process.env.REFRESH_SECRET,
    options: { expiresIn: process.env.REFRESH_TOKEN },
  });

  return res.status(200).json({
    success: true,
    message: "Logged in successfully",
    tokens: { accessToken, refreshToken },
  });
};

// =========================== 2) Refresh Token ===========================
export const refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body;

  let decoded;
  try {
    decoded = verifyToken({ token: refreshToken, secret: process.env.REFRESH_SECRET });
  } catch (error) {
    return next(new Error("Invalid or expired refresh token", { cause: 401 }));
  }

  if (!decoded?.id) return next(new Error("Invalid Token", { cause: 400 }));

  const user = await userModel.findById(decoded.id);
  if (!user) return next(new Error("User not found", { cause: 404 }));

  if (!user.verify) return next(new Error("Account not verified", { cause: 403 }));

  if (user.passwordChangedAt && decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
    return next(new Error("Token expired due to password change, please login again", { cause: 401 }));
  }

  const newAccessToken = createToken({
    payload: { id: user._id, roleType: user.roleType },
    secret: process.env.ACCESS_SECRET + user.createdAt.getTime(),
    options: { expiresIn: process.env.ACCESS_TOKEN },
  });

  return res.status(200).json({
    success: true,
    message: "Token refreshed successfully",
    accessToken: newAccessToken,
  });
};
