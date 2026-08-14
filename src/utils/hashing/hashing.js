import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

export const hashPassword = ({ plainText, salt = Number(process.env.SALT_ROUNDS) }) => {
  return bcrypt.hashSync(plainText, salt);
};

export const comparePassword = ({ plainText, hashPassword }) => {
  return bcrypt.compareSync(plainText, hashPassword);
};
