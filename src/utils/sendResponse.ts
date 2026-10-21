import type { Response } from "express";

interface Options<T> {
  statusCode?: number;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export const sendResponse = <T>(
  res: Response,
  {
    statusCode = 200,
    message = "Operation successful",
    data,
    meta,
  }: Options<T> = {},
) =>
  res.status(statusCode).json({
    success: true,
    message,
    data: data ?? {},
    ...(meta ? { meta } : {}),
  });
