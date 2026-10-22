import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { getActor, getQuery, param } from "../../utils/typed";
import * as service from "./schedule.service";
import type { ListSchedulesQuery } from "./schedule.validator";

export const create = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: 201,
    message: "Outage scheduled",
    data: await service.create(req.body, getActor(req)),
  });
});
export const generate = catchAsync(async (req, res) => {
  const data = await service.generate(req.body, getActor(req));
  sendResponse(res, {
    statusCode: data.dryRun ? 200 : 201,
    message: data.dryRun
      ? "Schedule preview generated (nothing saved)"
      : "Load-shedding schedule generated",
    data,
  });
});

export const list = catchAsync(async (req, res) => {
  const { items, meta } = await service.list(
    getQuery<ListSchedulesQuery>(req),
    getActor(req),
  );
  sendResponse(res, {
    message: "Scheduled outages fetched",
    data: items,
    meta,
  });
});
export const getById = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Scheduled outage fetched",
    data: await service.getById(param(req, "id"), getActor(req)),
  });
});
export const reschedule = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage rescheduled",
    data: await service.reschedule(param(req, "id"), req.body, getActor(req)),
  });
});
export const cancel = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage cancelled",
    data: await service.cancel(
      param(req, "id"),
      req.body.reason,
      getActor(req),
    ),
  });
});
export const remove = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Outage deleted",
    data: await service.softDelete(param(req, "id"), getActor(req)),
  });
});
