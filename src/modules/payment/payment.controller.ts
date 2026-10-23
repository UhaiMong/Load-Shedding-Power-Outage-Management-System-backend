import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { getActor, getQuery, param } from "../../utils/typed.js";
import * as service from "./payment.service.js";
import type { CallbackQuery, ListPaymentsQuery } from "./payment.validator.js";

export const initiate = catchAsync(async (req, res) => {
  const data = await service.initiate(req.body.billId, getActor(req));
  sendResponse(res, {
    statusCode: 201,
    message: "Payment initiated. Open bkashURL to complete the payment",
    data,
  });
});

export const callback = catchAsync(async (req, res) => {
  const data = await service.handleCallback(
    param(req, "id"),
    getQuery<CallbackQuery>(req),
  );
  sendResponse(res, { message: `Payment ${data.status.toLowerCase()}`, data });
});

export const webhook = catchAsync(async (req, res) => {
  const secret = req.header("x-webhook-secret");
  const data = await service.handleWebhook(req.body.paymentID, secret);
  sendResponse(res, { message: "Webhook processed", data });
});

export const verify = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Payment verified",
    data: await service.verify(param(req, "id"), getActor(req)),
  });
});

export const list = catchAsync(async (req, res) => {
  const { items, meta } = await service.list(
    getQuery<ListPaymentsQuery>(req),
    getActor(req),
  );
  sendResponse(res, { message: "Payments fetched", data: items, meta });
});

export const getById = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Payment fetched",
    data: await service.getById(param(req, "id"), getActor(req)),
  });
});
