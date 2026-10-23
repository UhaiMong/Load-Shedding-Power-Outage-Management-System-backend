import type { Prisma } from "../../../generated/prisma/client.js";
import { Role, ScheduleStatus } from "../../../generated/prisma/enums.js";
import { cache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/ApiError.js";
import { type Actor, audit } from "../../utils/audit.js";
import { containsInsensitive } from "../../utils/helpers.js";
import { buildMeta, getSkipTake } from "../../utils/pagination.js";
import { assertZoneAccess } from "../../utils/zoneAccess.js";
import type {
  CreateAreaInput,
  CreateFeederInput,
  CreateSubstationInput,
  CreateZoneInput,
  ListAreasQuery,
  ListFeedersQuery,
  ListSubstationsQuery,
  ListZonesQuery,
  UpdateAreaInput,
  UpdateFeederInput,
  UpdateFeederLoadInput,
  UpdateSubstationInput,
  UpdateZoneInput,
} from "./network.validator.js";

const live = { deletedAt: null } as const;
const invalidate = () => cache.invalidate("network:");
const cached = <T>(name: string, query: unknown, loader: () => Promise<T>) =>
  cache.wrap(`network:${name}:${JSON.stringify(query)}`, 120, loader);

const zoneSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  createdAt: true,
  manager: { select: { id: true, name: true, email: true } },
  _count: { select: { substations: { where: live } } },
} satisfies Prisma.ZoneSelect;

const substationSelect = {
  id: true,
  name: true,
  code: true,
  capacityMw: true,
  zoneId: true,
  createdAt: true,
  zone: { select: { id: true, name: true, code: true } },
  _count: { select: { feeders: { where: live } } },
} satisfies Prisma.SubstationSelect;

const feederSelect = {
  id: true,
  name: true,
  code: true,
  capacityMw: true,
  loadMw: true,
  priority: true,
  status: true,
  substationId: true,
  createdAt: true,
  substation: { select: { id: true, name: true, code: true, zoneId: true } },
  _count: { select: { areas: { where: live } } },
} satisfies Prisma.FeederSelect;

const areaSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  customerCount: true,
  address: true,
  feederId: true,
  createdAt: true,
  feeder: { select: { id: true, name: true, code: true, priority: true } },
} satisfies Prisma.AreaSelect;

//  zone resolution
const zoneOfSubstation = async (id: string) => {
  const row = await prisma.substation.findFirst({
    where: { id, ...live },
    select: { zoneId: true },
  });
  if (!row) throw new AppError(404, "Substation not found");
  return row.zoneId;
};
const zoneOfFeeder = async (id: string) => {
  const row = await prisma.feeder.findFirst({
    where: { id, ...live },
    select: { substation: { select: { zoneId: true } } },
  });
  if (!row) throw new AppError(404, "Feeder not found");
  return row.substation.zoneId;
};
const zoneOfArea = async (id: string) => {
  const row = await prisma.area.findFirst({
    where: { id, ...live },
    select: {
      feeder: { select: { substation: { select: { zoneId: true } } } },
    },
  });
  if (!row) throw new AppError(404, "Area not found");
  return row.feeder.substation.zoneId;
};

const assertManager = async (managerId: string) => {
  const manager = await prisma.user.findFirst({
    where: {
      id: managerId,
      role: Role.ZONE_MANAGER,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!manager)
    throw new AppError(422, "managerId must reference an active zone manager");
};

const finishDelete = async (
  actor: Actor,
  entity: string,
  id: string,
  count: number,
) => {
  if (count === 0) throw new AppError(404, `${entity} not found`);
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: `${entity.toUpperCase()}_DELETED`,
    entity,
    entityId: id,
  });
  await invalidate();
  return { deleted: true };
};

// ZONES
export const createZone = async (input: CreateZoneInput, actor: Actor) => {
  if (input.managerId) await assertManager(input.managerId);
  const zone = await prisma.$transaction(async (tx) => {
    const created = await tx.zone.create({
      data: {
        name: input.name,
        code: input.code,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.managerId
          ? { manager: { connect: { id: input.managerId } } }
          : {}),
      },
      select: zoneSelect,
    });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "ZONE_CREATED",
      entity: "Zone",
      entityId: created.id,
    });
    return created;
  });
  await invalidate();
  return zone;
};

export const listZones = (query: ListZonesQuery) =>
  cached("zones", query, async () => {
    const where = {
      ...live,
      ...(query.q
        ? {
            OR: [
              { name: containsInsensitive(query.q) },
              { code: containsInsensitive(query.q) },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.zone.findMany({
        where,
        select: zoneSelect,
        orderBy: { [query.sortBy]: query.order },
        ...getSkipTake(query),
      }),
      prisma.zone.count({ where }),
    ]);
    return { items, meta: buildMeta(query.page, query.limit, total) };
  });

export const getZone = async (id: string) => {
  const zone = await prisma.zone.findFirst({
    where: { id, ...live },
    select: {
      ...zoneSelect,
      substations: {
        where: live,
        select: { id: true, name: true, code: true, capacityMw: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!zone) throw new AppError(404, "Zone not found");
  return zone;
};

export const updateZone = async (
  id: string,
  input: UpdateZoneInput,
  actor: Actor,
) => {
  await assertZoneAccess(actor, id);
  if (input.managerId !== undefined && actor.role !== Role.ADMIN) {
    throw new AppError(403, "Only an admin can change the zone manager");
  }
  if (input.managerId) await assertManager(input.managerId);
  const { count } = await prisma.zone.updateMany({
    where: { id, ...live },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.managerId !== undefined
        ? { manager: { connect: { id: input.managerId } } }
        : {}),
    },
  });
  if (count === 0) throw new AppError(404, "Zone not found");
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "ZONE_UPDATED",
    entity: "Zone",
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  await invalidate();
  return getZone(id);
};

export const deleteZone = async (id: string, actor: Actor) => {
  if ((await prisma.substation.count({ where: { zoneId: id, ...live } })) > 0) {
    throw new AppError(409, "Zone still has substations. Remove them first");
  }
  const { count } = await prisma.zone.updateMany({
    where: { id, ...live },
    data: { deletedAt: new Date() },
  });
  return finishDelete(actor, "Zone", id, count);
};

//  SUBSTATIONS
export const createSubstation = async (
  input: CreateSubstationInput,
  actor: Actor,
) => {
  await assertZoneAccess(actor, input.zoneId);
  const zone = await prisma.zone.findFirst({
    where: { id: input.zoneId, ...live },
    select: { id: true },
  });
  if (!zone) throw new AppError(404, "Zone not found");
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.substation.create({
      data: input,
      select: substationSelect,
    });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "SUBSTATION_CREATED",
      entity: "Substation",
      entityId: row.id,
    });
    return row;
  });
  await invalidate();
  return created;
};

export const listSubstations = (query: ListSubstationsQuery) =>
  cached("substations", query, async () => {
    const where = {
      ...live,
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: containsInsensitive(query.q) },
              { code: containsInsensitive(query.q) },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.substation.findMany({
        where,
        select: substationSelect,
        orderBy: { [query.sortBy]: query.order },
        ...getSkipTake(query),
      }),
      prisma.substation.count({ where }),
    ]);
    return { items, meta: buildMeta(query.page, query.limit, total) };
  });

export const getSubstation = async (id: string) => {
  const row = await prisma.substation.findFirst({
    where: { id, ...live },
    select: {
      ...substationSelect,
      feeders: {
        where: live,
        select: {
          id: true,
          name: true,
          code: true,
          priority: true,
          status: true,
          loadMw: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!row) throw new AppError(404, "Substation not found");
  return row;
};

export const updateSubstation = async (
  id: string,
  input: UpdateSubstationInput,
  actor: Actor,
) => {
  await assertZoneAccess(actor, await zoneOfSubstation(id));
  await prisma.substation.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.capacityMw !== undefined
        ? { capacityMw: input.capacityMw }
        : {}),
    },
  });
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "SUBSTATION_UPDATED",
    entity: "Substation",
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  await invalidate();
  return getSubstation(id);
};

export const deleteSubstation = async (id: string, actor: Actor) => {
  await assertZoneAccess(actor, await zoneOfSubstation(id));
  if (
    (await prisma.feeder.count({ where: { substationId: id, ...live } })) > 0
  ) {
    throw new AppError(409, "Substation still has feeders. Remove them first");
  }
  const { count } = await prisma.substation.updateMany({
    where: { id, ...live },
    data: { deletedAt: new Date() },
  });
  return finishDelete(actor, "Substation", id, count);
};

//  FEEDERS
export const createFeeder = async (input: CreateFeederInput, actor: Actor) => {
  await assertZoneAccess(actor, await zoneOfSubstation(input.substationId));
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.feeder.create({ data: input, select: feederSelect });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "FEEDER_CREATED",
      entity: "Feeder",
      entityId: row.id,
    });
    return row;
  });
  await invalidate();
  return created;
};

export const listFeeders = (query: ListFeedersQuery) =>
  cached("feeders", query, async () => {
    const where = {
      ...live,
      ...(query.substationId ? { substationId: query.substationId } : {}),
      ...(query.zoneId ? { substation: { zoneId: query.zoneId } } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: containsInsensitive(query.q) },
              { code: containsInsensitive(query.q) },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.feeder.findMany({
        where,
        select: feederSelect,
        orderBy: { [query.sortBy]: query.order },
        ...getSkipTake(query),
      }),
      prisma.feeder.count({ where }),
    ]);
    return { items, meta: buildMeta(query.page, query.limit, total) };
  });

export const getFeeder = async (id: string) => {
  const row = await prisma.feeder.findFirst({
    where: { id, ...live },
    select: {
      ...feederSelect,
      areas: {
        where: live,
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          customerCount: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!row) throw new AppError(404, "Feeder not found");
  return row;
};

export const updateFeeder = async (
  id: string,
  input: UpdateFeederInput,
  actor: Actor,
) => {
  await assertZoneAccess(actor, await zoneOfFeeder(id));
  if (input.capacityMw !== undefined) {
    const current = await prisma.feeder.findUniqueOrThrow({
      where: { id },
      select: { loadMw: true },
    });
    if (current.loadMw > input.capacityMw)
      throw new AppError(
        422,
        "capacityMw cannot be lower than the current load",
      );
  }
  await prisma.feeder.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.capacityMw !== undefined
        ? { capacityMw: input.capacityMw }
        : {}),
    },
  });
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "FEEDER_UPDATED",
    entity: "Feeder",
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  await invalidate();
  return getFeeder(id);
};

/** Operators push live load readings; used by priority-based schedule generation. */
export const updateFeederLoad = async (
  id: string,
  input: UpdateFeederLoadInput,
  actor: Actor,
) => {
  await assertZoneAccess(actor, await zoneOfFeeder(id));
  const feeder = await prisma.feeder.findUniqueOrThrow({
    where: { id },
    select: { capacityMw: true },
  });
  if (input.loadMw > feeder.capacityMw)
    throw new AppError(422, "loadMw cannot exceed the feeder capacity");
  await prisma.feeder.update({
    where: { id },
    data: {
      ...(input.loadMw !== undefined ? { loadMw: input.loadMw } : {}),
    },
  });
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "FEEDER_LOAD_UPDATED",
    entity: "Feeder",
    entityId: id,
    metadata: { ...input },
  });
  await invalidate();
  return getFeeder(id);
};

export const deleteFeeder = async (id: string, actor: Actor) => {
  await assertZoneAccess(actor, await zoneOfFeeder(id));
  const [areas, schedules] = await Promise.all([
    prisma.area.count({ where: { feederId: id, ...live } }),
    prisma.scheduledOutage.count({
      where: {
        feederId: id,
        ...live,
        status: { in: [ScheduleStatus.SCHEDULED, ScheduleStatus.ACTIVE] },
      },
    }),
  ]);
  if (areas > 0)
    throw new AppError(409, "Feeder still has areas. Remove them first");
  if (schedules > 0)
    throw new AppError(
      409,
      "Feeder has pending scheduled outages. Cancel them first",
    );
  const { count } = await prisma.feeder.updateMany({
    where: { id, ...live },
    data: { deletedAt: new Date() },
  });
  return finishDelete(actor, "Feeder", id, count);
};

//  AREAS
export const createArea = async (input: CreateAreaInput, actor: Actor) => {
  await assertZoneAccess(actor, await zoneOfFeeder(input.feederId));
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.area.create({
      data: { ...input, address: input.address ?? null },
      select: areaSelect,
    });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "AREA_CREATED",
      entity: "Area",
      entityId: row.id,
    });
    return row;
  });
  await invalidate();
  return created;
};

export const listAreas = (query: ListAreasQuery) =>
  cached("areas", query, async () => {
    const where = {
      ...live,
      ...(query.feederId ? { feederId: query.feederId } : {}),
      ...(query.zoneId
        ? { feeder: { substation: { zoneId: query.zoneId } } }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q
        ? {
            OR: [
              { name: containsInsensitive(query.q) },
              { code: containsInsensitive(query.q) },
              { address: containsInsensitive(query.q) },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.area.findMany({
        where,
        select: areaSelect,
        orderBy: { [query.sortBy]: query.order },
        ...getSkipTake(query),
      }),
      prisma.area.count({ where }),
    ]);
    return { items, meta: buildMeta(query.page, query.limit, total) };
  });

export const getArea = async (id: string) => {
  const row = await prisma.area.findFirst({
    where: { id, ...live },
    select: areaSelect,
  });
  if (!row) throw new AppError(404, "Area not found");
  return row;
};

export const updateArea = async (
  id: string,
  input: UpdateAreaInput,
  actor: Actor,
) => {
  await assertZoneAccess(actor, await zoneOfArea(id));
  await prisma.area.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    },
  });
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "AREA_UPDATED",
    entity: "Area",
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  await invalidate();
  return getArea(id);
};

export const deleteArea = async (id: string, actor: Actor) => {
  await assertZoneAccess(actor, await zoneOfArea(id));
  const [customers, openOutages] = await Promise.all([
    prisma.profile.count({ where: { areaId: id, user: { deletedAt: null } } }),
    prisma.outage.count({
      where: {
        areaId: id,
        ...live,
        status: { in: ["REPORTED", "VERIFIED", "ASSIGNED", "IN_PROGRESS"] },
      },
    }),
  ]);
  if (customers > 0)
    throw new AppError(409, "Area still has registered customers");
  if (openOutages > 0) throw new AppError(409, "Area has open outages");
  const { count } = await prisma.area.updateMany({
    where: { id, ...live },
    data: { deletedAt: new Date() },
  });
  return finishDelete(actor, "Area", id, count);
};
