import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { getActor, getQuery, param } from "../../utils/typed.js";
import * as service from "./outage.service.js";
import type { ListOutagesQuery } from "./outage.validator.js";

export const report = catchAsync(async (req, res) => {
  const data = await service.report(req.body, req.file, getActor(req));
  sendResponse(res, {
    statusCode: data.isNew ? 201 : 200,
    message: data.isNew ? "Outage reported" : "Your report was added to the existing outage ticket",
    data,
  });
});

export const list = catchAsync(async (req, res) => {
  const { items, meta } = await service.list(getQuery<ListOutagesQuery>(req), getActor(req));
  sendResponse(res, { message: "Outages fetched", data: items, meta });
});

export const myAssigned = catchAsync(async (req, res) => {
  const { items, meta } = await service.myAssigned(getQuery<ListOutagesQuery>(req), getActor(req));
  sendResponse(res, { message: "Assigned outages fetched", data: items, meta });
});

export const myReports = catchAsync(async (req, res) => {
  const { items, meta } = await service.myReports(getQuery<ListOutagesQuery>(req), getActor(req));
  sendResponse(res, { message: "Your reported outages fetched", data: items, meta });
});

export const getById = catchAsync(async (req, res) => {
  sendResponse(res, { message: "Outage fetched", data: await service.getById(param(req, "id"), getActor(req)) });
});

export const timeline = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage timeline fetched",
    data: await service.timeline(param(req, "id"), getActor(req)),
  });
});

export const verify = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage verified",
    data: await service.verify(param(req, "id"), req.body, getActor(req)),
  });
});

export const reject = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage rejected",
    data: await service.reject(param(req, "id"), req.body.reason, getActor(req)),
  });
});

export const assign = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Technician assigned",
    data: await service.assign(param(req, "id"), req.body.technicianId, getActor(req)),
  });
});

export const autoAssign = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Technician auto-assigned",
    data: await service.autoAssign(param(req, "id"), getActor(req)),
  });
});

export const updateStatus = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage status updated",
    data: await service.updateStatus(param(req, "id"), req.body, getActor(req)),
  });
});

export const remove = catchAsync(async (req, res) => {
  sendResponse(res, { message: "Outage deleted", data: await service.softDelete(param(req, "id"), getActor(req)) });
});
