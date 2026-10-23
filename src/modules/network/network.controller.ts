import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { getActor, getQuery, param } from "../../utils/typed";
import * as service from "./network.service";
import type {
  ListAreasQuery,
  ListFeedersQuery,
  ListSubstationsQuery,
  ListZonesQuery,
} from "./network.validator";

// Zones
export const createZone = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: 201,
    message: "Zone created",
    data: await service.createZone(req.body, getActor(req)),
  });
});
export const listZones = catchAsync(async (req, res) => {
  const { items, meta } = await service.listZones(
    getQuery<ListZonesQuery>(req),
  );
  sendResponse(res, { message: "Zones fetched", data: items, meta });
});
export const getZone = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Zone fetched",
    data: await service.getZone(param(req, "id")),
  });
});
export const updateZone = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Zone updated",
    data: await service.updateZone(param(req, "id"), req.body, getActor(req)),
  });
});
export const deleteZone = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Zone deleted",
    data: await service.deleteZone(param(req, "id"), getActor(req)),
  });
});

//Substations
export const createSubstation = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: 201,
    message: "Substation created",
    data: await service.createSubstation(req.body, getActor(req)),
  });
});
export const listSubstations = catchAsync(async (req, res) => {
  const { items, meta } = await service.listSubstations(
    getQuery<ListSubstationsQuery>(req),
  );
  sendResponse(res, { message: "Substations fetched", data: items, meta });
});
export const getSubstation = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Substation fetched",
    data: await service.getSubstation(param(req, "id")),
  });
});
export const updateSubstation = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Substation updated",
    data: await service.updateSubstation(
      param(req, "id"),
      req.body,
      getActor(req),
    ),
  });
});
export const deleteSubstation = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Substation deleted",
    data: await service.deleteSubstation(param(req, "id"), getActor(req)),
  });
});

// Feeders
export const createFeeder = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: 201,
    message: "Feeder created",
    data: await service.createFeeder(req.body, getActor(req)),
  });
});
export const listFeeders = catchAsync(async (req, res) => {
  const { items, meta } = await service.listFeeders(
    getQuery<ListFeedersQuery>(req),
  );
  sendResponse(res, { message: "Feeders fetched", data: items, meta });
});
export const getFeeder = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Feeder fetched",
    data: await service.getFeeder(param(req, "id")),
  });
});
export const updateFeeder = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Feeder updated",
    data: await service.updateFeeder(param(req, "id"), req.body, getActor(req)),
  });
});
export const updateFeederLoad = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Feeder load updated",
    data: await service.updateFeederLoad(
      param(req, "id"),
      req.body,
      getActor(req),
    ),
  });
});
export const deleteFeeder = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Feeder deleted",
    data: await service.deleteFeeder(param(req, "id"), getActor(req)),
  });
});

// ---- Areas ----
export const createArea = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: 201,
    message: "Area created",
    data: await service.createArea(req.body, getActor(req)),
  });
});
export const listAreas = catchAsync(async (req, res) => {
  const { items, meta } = await service.listAreas(
    getQuery<ListAreasQuery>(req),
  );
  sendResponse(res, { message: "Areas fetched", data: items, meta });
});
export const getArea = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Area fetched",
    data: await service.getArea(param(req, "id")),
  });
});
export const updateArea = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Area updated",
    data: await service.updateArea(param(req, "id"), req.body, getActor(req)),
  });
});
export const deleteArea = catchAsync(async (req, res) => {
  sendResponse(res, {
    message: "Area deleted",
    data: await service.deleteArea(param(req, "id"), getActor(req)),
  });
});
