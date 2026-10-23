import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { getQuery } from "../../utils/typed.js";
import * as service from "./analytics.service.js";
import type { AnalyticsQuery } from "./analytics.validator.js";

export const outageSummary = catchAsync(async (req, res) => {
  sendResponse(res, { message: "Outage summary", data: await service.outageSummary(getQuery<AnalyticsQuery>(req)) });
});
export const areaReliability = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Area reliability",
    data: await service.areaReliability(getQuery<AnalyticsQuery>(req)),
  });
});
export const technicianPerformance = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Technician performance",
    data: await service.technicianPerformance(getQuery<AnalyticsQuery>(req)),
  });
});
