export const notFoundHandler = (req, res, next) => {
  return next(new Error(`Router ${req.originalUrl} not found in this server`, { cause: 404 }));
};
