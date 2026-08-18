import { decryptPhone, encryptPhone } from "../../utils/encryption/encryption.js";

// =========================== 1) Get Profile ===========================
export const getMe = async (req, res, next) => {
  const user = req.user;
  const userData = {
    _id: user._id,
    userName: user.userName,
    email: user.email,
    phone: decryptPhone({ cipherText: user.phone }),
    address: user.address,
    roleType: user.roleType,
    verify: user.verify,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return res.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    data: userData,
  });
};

// =========================== 2) Update Profile ===========================
export const updateMe = async (req, res, next) => {
  const user = req.user;

  if (req.body.userName) user.userName = req.body.userName;
  if (req.body.address) user.address = req.body.address;
  if (req.body.phone) user.phone = encryptPhone({ cipherText: req.body.phone });

  await user.save();

  const userData = {
    _id: user._id,
    userName: user.userName,
    email: user.email,
    phone: decryptPhone({ cipherText: user.phone }),
    address: user.address,
    roleType: user.roleType,
    verify: user.verify,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: userData,
  });
};
