import type { Request } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { getActor, getQuery } from "../../utils/typed.js";
import * as service from "./user.service.js";
import type { ListTechniciansQuery } from "./user.validator.js";

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
export const uploadAvatar = catchAsync(async (req: Request, res) => {
  const data = await service.uploadAvatar(getActor(req), req.file);
  sendResponse(res, { message: "Avatar updated", data });
});

export const setAvailability = catchAsync(async (req: Request, res) => {
  const data = await service.setAvailability(
    getActor(req),
    req.body.isAvailable,
  );
  sendResponse(res, { message: "Availability updated", data });
});

export const deleteMe = catchAsync(async (req: Request, res) => {
  const data = await service.deleteMe(getActor(req));
  sendResponse(res, { message: "Account deleted", data });
});

export const listTechnicians = catchAsync(async (req: Request, res) => {
  const { items, meta } = await service.listTechnicians(
    getQuery<ListTechniciansQuery>(req),
  );
  sendResponse(res, { message: "Technicians fetched", data: items, meta });
});
