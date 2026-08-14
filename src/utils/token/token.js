import jwt from "jsonwebtoken";

export const createToken = ({ payload, secret, options = {} }) => {
  return jwt.sign(payload, secret, options);
};

export const verifyToken = ({ token, secret }) => {
  return jwt.verify(token, secret);
};
