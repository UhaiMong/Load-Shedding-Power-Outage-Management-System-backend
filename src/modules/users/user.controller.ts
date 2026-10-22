import type { Request } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { getActor, getQuery } from "../../utils/typed";
import * as service from "./user.service";
import type { ListTechniciansQuery } from "./user.validator";

export const getMe = catchAsync(async (req: Request, res) => {
  const actorId = getActor(req).id;
  if (actorId == null) throw new Error("Authenticated user ID is required");
  const data = await service.getMe(String(actorId));
  sendResponse(res, { message: "Profile fetched", data });
});

export const updateMe = catchAsync(async (req: Request, res) => {
  const data = await service.updateMe(getActor(req), req.body);
  sendResponse(res, { message: "Profile updated", data });
});
