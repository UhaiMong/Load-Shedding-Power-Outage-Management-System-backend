import { rateLimit } from "express-rate-limit";
import { AppError } from "../utils/ApiError.js";

const build = (windowMs: number, limit: number, message: string) =>
	rateLimit({
		windowMs,
		limit,
		standardHeaders: "draft-8",
		legacyHeaders: false,
		handler: (_req, _res, next) => next(new AppError(429, message)),
	});

export const apiLimiter = build(
	15 * 60 * 1000,
	300,
	"Too many requests, please try again later",
);
export const authLimiter = build(
	15 * 60 * 1000,
	20,
	"Too many authentication attempts, try again later",
);
export const paymentLimiter = build(
	15 * 60 * 1000,
	30,
	"Too many payment requests, try again later",
);
