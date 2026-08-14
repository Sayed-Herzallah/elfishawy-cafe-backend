import { userModel } from "../../database/model/user.model.js";
import { hashPassword } from "../../utils/hashing/hashing.js";
import { encryptPhone, decryptPhone } from "../../utils/encryption/encryption.js";

// =========================== 1) Create Staff ===========================
export const createStaff = async (req, res, next) => {
  const { userName, email, phone, password, address, roleType } = req.body;

  const existingUser = await userModel.findOne({ email });
  if (existingUser) return next(new Error("Email already exists", { cause: 409 }));

  const passwordHash = hashPassword({ plainText: password });
  const encryptedPhone = encryptPhone({ cipherText: phone });

  const newUser = await userModel.create({
    userName,
    email,
    phone: encryptedPhone,
    password: passwordHash,
    address,
    roleType,
    verify: true,
  });

  const userData = {
    _id: newUser._id,
    userName: newUser.userName,
    email: newUser.email,
    phone: decryptPhone({ cipherText: newUser.phone }),
    address: newUser.address,
    roleType: newUser.roleType,
    verify: newUser.verify,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };

  return res.status(201).json({
    success: true,
    message: "Staff member created successfully",
    data: userData,
  });
};

// =========================== 2) Get Profile ===========================
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

// =========================== 3) Update Profile ===========================
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

// =========================== 4) List Staff ===========================
export const listStaff = async (req, res, next) => {
  const data = await userModel.find({})
    .select("-password -__v")
    .sort({ createdAt: -1 })
    .lean();

  // Decrypt phone numbers for all listed users
  const decryptedData = data.map((user) => ({
    ...user,
    phone: decryptPhone({ cipherText: user.phone }),
  }));

  return res.status(200).json({
    success: true,
    message: "Staff list retrieved successfully",
    data: decryptedData,
  });
};

// =========================== 5) Delete Staff ===========================
export const deleteStaff = async (req, res, next) => {
  const { id } = req.params;

  const user = await userModel.findById(id);
  if (!user) return next(new Error("Staff user not found", { cause: 404 }));

  // Prevent deleting the last admin
  if (user.roleType === "admin") {
    const adminCount = await userModel.countDocuments({ roleType: "admin" });
    if (adminCount <= 1) {
      return next(new Error("Cannot delete the only admin user in the system", { cause: 400 }));
    }
  }

  await userModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: "Staff member deleted successfully",
  });
};
