import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { getActor, getQuery, param } from "../../utils/typed.js";
import * as service from "./bill.service.js";
import type { ListBillsQuery } from "./bill.validator.js";

export const create = catchAsync(async (req, res) => {
  sendResponse(res, { statusCode: 201, message: "Bill created", data: await service.create(req.body, getActor(req)) });
});
export const list = catchAsync(async (req, res) => {
  const { items, meta } = await service.list(getQuery<ListBillsQuery>(req), getActor(req));
  sendResponse(res, { message: "Bills fetched", data: items, meta });
});
export const getById = catchAsync(async (req, res) => {
  sendResponse(res, { message: "Bill fetched", data: await service.getById(param(req, "id"), getActor(req)) });
});
export const remove = catchAsync(async (req, res) => {
  sendResponse(res, { message: "Bill deleted", data: await service.softDelete(param(req, "id"), getActor(req)) });
});
