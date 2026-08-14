export const globalErrorHandler = async (error, req, res, next) => {
  const status = error.cause || 500;
  return res.status(status).json({
    success: false,
    message: error.message,
    details: error.details || []
  });
};
