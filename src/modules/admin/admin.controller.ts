import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { getActor, getQuery, param } from "../../utils/typed";
import * as service from "./admin.service";
import type { AuditLogsQuery, ListUsersQuery } from "./admin.validator";

export const listUsers = catchAsync(async (req, res) => {
  const { items, meta } = await service.listUsers(
    getQuery<ListUsersQuery>(req),
  );
  sendResponse(res, { message: "Users fetched", data: items, meta });
});

export const getUser = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "User fetched",
    data: await service.getUser(param(req, "id")),
  });
});

export const createStaff = catchAsync(async (req, res) => {
  const data = await service.createStaff(req.body, getActor(req));
  sendResponse(res, {
    statusCode: 201,
    message: "Staff account created",
    data,
  });
});

export const updateRole = catchAsync(async (req, res) => {
  const data = await service.updateRole(
    param(req, "id"),
    req.body,
    getActor(req),
  );
  sendResponse(res, { message: "User role updated", data });
});

export const setStatus = catchAsync(async (req, res) => {
  const data = await service.setStatus(
    param(req, "id"),
    req.body.isActive,
    getActor(req),
  );
  sendResponse(res, { message: "User status updated", data });
});

export const deleteUser = catchAsync(async (req, res) => {
  const data = await service.softDeleteUser(param(req, "id"), getActor(req));
  sendResponse(res, { message: "User deleted", data });
});

export const dashboardStats = catchAsync(async (_req, res) => {
  sendResponse(res, {
    message: "Dashboard statistics",
    data: await service.dashboardStats(),
  });
});

export const listAuditLogs = catchAsync(async (req, res) => {
  const { items, meta } = await service.listAuditLogs(
    getQuery<AuditLogsQuery>(req),
  );
  sendResponse(res, { message: "Audit logs fetched", data: items, meta });
});
