import crypto from "crypto-js";
import dotenv from "dotenv";

dotenv.config();

export const encryptPhone = ({ cipherText, secret = process.env.PHONE_ENCRYPTION_KEY }) => {
  if (!cipherText) return "";
  return crypto.AES.encrypt(cipherText, secret).toString();
};

export const decryptPhone = ({ cipherText, secret = process.env.PHONE_ENCRYPTION_KEY }) => {
  if (!cipherText) return "";
  try {
    const decrypted = crypto.AES.decrypt(cipherText, secret).toString(crypto.enc.Utf8);
    return decrypted || cipherText;
  } catch {
    return cipherText;
  }
};
