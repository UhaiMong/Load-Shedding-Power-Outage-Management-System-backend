import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as service from "./auth.service.js";

export const register = catchAsync(async (req, res) => {
  const data = await service.register(req.body, req.ip);
  sendResponse(res, {
    statusCode: 201,
    message: data.otpSent
      ? "Registration successful. Enter the OTP sent to your email to verify it"
      : "Registration successful, but the OTP could not be sent. Use resend-otp",
    data,
  });
});

export const verifyEmail = catchAsync(async (req, res) => {
  const data = await service.verifyEmail(req.body, req.ip);
  sendResponse(res, { message: "Email verified successfully", data });
});

export const resendOtp = catchAsync(async (req, res) => {
  const data = await service.resendVerificationOtp(req.body.email);
  sendResponse(res, { message: data.message, data });
});

export const login = catchAsync(async (req, res) => {
  const data = await service.login(req.body, req.ip);
  sendResponse(res, { message: "Login successful", data });
});

export const refreshToken = catchAsync(async (req, res) => {
  const data = await service.refreshToken(req.headers, req.ip);
  sendResponse(res, { message: "Token refreshed", data });
});

export const logout = catchAsync(async (req, res) => {
  const user = (req as typeof req & { user?: { id: string } }).user;
  if (!user) throw new Error("Authenticated user is required");
  const data = await service.logout(req.headers, user?.id, req.ip);
  sendResponse(res, { message: "Logged out successfully", data });
});

export const forgotPassword = catchAsync(async (req, res) => {
  const data = await service.forgotPassword(req.body.email);
  sendResponse(res, { message: data.message, data });
});

export const resetPassword = catchAsync(async (req, res) => {
  const data = await service.resetPassword(req.body, req.ip);
  sendResponse(res, {
    message: "Password reset successful. Please log in",
    data,
  });
});

export const sendChangePasswordOtp = catchAsync(
  async (req: Request, res: Response) => {
    const user = (
      req as Request & {
        user?: Parameters<typeof service.sendChangePasswordOtp>[0];
      }
    ).user;
    if (!user) throw new Error("Authenticated user is required");

    const data = await service.sendChangePasswordOtp(user);
    sendResponse(res, { message: data.message, data });
  },
);

export const changePassword = catchAsync(
  async (req: Request, res: Response) => {
    const user = (
      req as Request & {
        user?: Parameters<typeof service.sendChangePasswordOtp>[0];
      }
    ).user;
    if (!user) throw new Error("Authenticated user is required");
    const data = await service.changePassword(
      user,
      req.headers,
      req.body,
      req.ip,
    );
    sendResponse(res, { message: "Password changed successfully", data });
  },
);
