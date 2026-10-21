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
