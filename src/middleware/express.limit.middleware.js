import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100, // Increased max limit for local testing / normal operations
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "❌ Too many requests, please try again later."
    });
  }
});

export default limiter;
