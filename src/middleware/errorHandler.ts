import { Prisma } from "@generated/prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { isProd } from "../config/env";
import { AppError } from "../utils/ApiError";

interface Normalized {
  statusCode: number;
  message: string;
  errors: unknown[];
}

const prismaTarget = (meta: Record<string, unknown> | undefined) => {
  const direct = meta?.target;
  if (Array.isArray(direct)) return direct.join(", ");
  if (typeof direct === "string") return direct;
  const fields = (
    meta?.driverAdapterError as {
      cause?: { constraint?: { fields?: string[] } };
    }
  )?.cause?.constraint?.fields;
  return fields?.join(", ");
};

/** Translate any thrown value into a consistent shape. */
export const normalizeError = (err: unknown): Normalized => {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      message: "Validation failed",
      errors: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const target = prismaTarget(err.meta);
        return {
          statusCode: 409,
          message: target
            ? `Duplicate value for: ${target}`
            : "A record with the same unique value already exists",
          errors: [],
        };
      }
      case "P2025":
        return { statusCode: 404, message: "Record not found", errors: [] };
      case "P2003":
        return {
          statusCode: 409,
          message: "Operation violates a relation constraint",
          errors: [],
        };
      case "P2034":
        return {
          statusCode: 409,
          message: "Conflicting concurrent update, please retry",
          errors: [],
        };
      default:
        return {
          statusCode: 400,
          message: "Database request error",
          errors: [{ code: err.code }],
        };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      message: "Invalid database query input",
      errors: [],
    };
  }

  if (err instanceof multer.MulterError) {
    return {
      statusCode: 400,
      message: err.message,
      errors: [{ code: err.code, field: err.field }],
    };
  }

  if (err && typeof err === "object") {
    const e = err as {
      name?: string;
      type?: string;
      status?: number;
      statusCode?: number;
      message?: string;
      body?: { message?: string; code?: string };
    };
    // Better Auth APIError
    if (e.name === "APIError" && typeof e.statusCode === "number") {
      return {
        statusCode: e.statusCode,
        message: e.body?.message ?? e.message ?? "Authentication error",
        errors: e.body?.code ? [{ code: e.body.code }] : [],
      };
    }
    // Malformed JSON body
    if (e.type === "entity.parse.failed") {
      return { statusCode: 400, message: "Malformed JSON body", errors: [] };
    }
    // http-errors style (payload too large, etc.)
    const status = e.status ?? e.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return {
        statusCode: status,
        message: e.message ?? "Request error",
        errors: [],
      };
    }
  }

  return { statusCode: 500, message: "Internal server error", errors: [] };
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/** Global error handler. */
export const globalErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next,
) => {
  if (res.headersSent) return next(err);

  const { statusCode, message, errors } = normalizeError(err);
  if (statusCode >= 500)
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(!isProd && statusCode >= 500 && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });
};
