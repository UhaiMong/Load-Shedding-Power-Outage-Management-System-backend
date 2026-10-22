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
