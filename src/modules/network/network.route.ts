import { Router } from "express";
import { ROLE_GROUPS } from "../../config/roles.js";
import { authenticate, authorize } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./network.controller.js";
import * as v from "./network.validator.js";

const manage = authorize(...ROLE_GROUPS.MANAGEMENT);
const adminOnly = authorize(...ROLE_GROUPS.ADMIN);
const staff = authorize(...ROLE_GROUPS.STAFF);
const idParam = validate({ params: v.idParamSchema });

export const zoneRouter = Router();
zoneRouter.use(authenticate);
zoneRouter.post(
  "/",
  adminOnly,
  validate({ body: v.createZoneSchema }),
  c.createZone,
);
zoneRouter.get("/", validate({ query: v.listZonesQuery }), c.listZones);
zoneRouter.get("/:id", idParam, c.getZone);
zoneRouter.patch(
  "/:id",
  manage,
  validate({ params: v.idParamSchema, body: v.updateZoneSchema }),
  c.updateZone,
);
zoneRouter.delete("/:id", adminOnly, idParam, c.deleteZone);

export const substationRouter = Router();
substationRouter.use(authenticate);
substationRouter.post(
  "/",
  manage,
  validate({ body: v.createSubstationSchema }),
  c.createSubstation,
);
substationRouter.get(
  "/",
  validate({ query: v.listSubstationsQuery }),
  c.listSubstations,
);
substationRouter.get("/:id", idParam, c.getSubstation);
substationRouter.patch(
  "/:id",
  manage,
  validate({ params: v.idParamSchema, body: v.updateSubstationSchema }),
  c.updateSubstation,
);
substationRouter.delete("/:id", manage, idParam, c.deleteSubstation);

export const feederRouter = Router();
feederRouter.use(authenticate);
feederRouter.post(
  "/",
  manage,
  validate({ body: v.createFeederSchema }),
  c.createFeeder,
);
feederRouter.get("/", validate({ query: v.listFeedersQuery }), c.listFeeders);
feederRouter.get("/:id", idParam, c.getFeeder);
feederRouter.patch(
  "/:id",
  manage,
  validate({ params: v.idParamSchema, body: v.updateFeederSchema }),
  c.updateFeeder,
);
feederRouter.patch(
  "/:id/load",
  staff,
  validate({ params: v.idParamSchema, body: v.updateFeederLoadSchema }),
  c.updateFeederLoad,
);
feederRouter.delete("/:id", manage, idParam, c.deleteFeeder);

export const areaRouter = Router();
areaRouter.use(authenticate);
areaRouter.post(
  "/",
  manage,
  validate({ body: v.createAreaSchema }),
  c.createArea,
);
areaRouter.get("/", validate({ query: v.listAreasQuery }), c.listAreas);
areaRouter.get("/:id", idParam, c.getArea);
areaRouter.patch(
  "/:id",
  manage,
  validate({ params: v.idParamSchema, body: v.updateAreaSchema }),
  c.updateArea,
);
areaRouter.delete("/:id", manage, idParam, c.deleteArea);
