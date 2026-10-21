import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import * as service from "./auth.service";

// Register
export const register = catchAsync(async (req, res) => {
  const data = await service.register(req.body, req.ip);
  sendResponse(res, {
    statusCode: 201,
    message: "Registration successful",
    data,
  });
});
// Login
export const login = catchAsync(async (req, res) => {
  const data = await service.login(req.body, req.ip);
  sendResponse(res, { message: "Login successful", data });
});
// refresh token
export const refreshToken = catchAsync(async (req, res) => {
  const data = await service.refreshToken(req.headers, req.ip);
  sendResponse(res, { message: "Token refreshed", data });
});

// logout

export const logout = catchAsync(async (req, res) => {
  const user = (req as typeof req & { user?: { id: string } }).user;
  if (!user) throw new Error("Authenticated user is required");

  const data = await service.logout(req.headers, user.id, req.ip);
  sendResponse(res, { message: "Logged out successfully", data });
});
