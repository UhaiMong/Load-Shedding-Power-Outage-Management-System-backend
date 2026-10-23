import type { Request } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { getQuery, param } from "../../utils/typed";
import * as service from "./notification.service";
import type { ListNotificationsQuery } from "./notification.validator";

type AuthenticatedRequest = Request & { user: { id: string } };

const getUserId = (req: Request) => (req as AuthenticatedRequest).user.id;

export const listMine = catchAsync(async (req, res) => {
  const { items, meta } = await service.listMine(
    getUserId(req),
    getQuery<ListNotificationsQuery>(req),
  );
  sendResponse(res, { message: "Notifications fetched", data: items, meta });
});

export const markRead = catchAsync(async (req, res) => {
  const data = await service.markRead(getUserId(req), param(req, "id"));
  sendResponse(res, { message: "Notification marked as read", data });
});

export const markAllRead = catchAsync(async (req, res) => {
  const data = await service.markAllRead(getUserId(req));
  sendResponse(res, { message: "All notifications marked as read", data });
});
