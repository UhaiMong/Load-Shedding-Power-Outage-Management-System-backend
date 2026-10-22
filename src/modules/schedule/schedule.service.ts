import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  PriorityLevel,
  Role,
  ScheduleStatus,
  ScheduleType,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/ApiError";
import { type Actor, audit, type Db } from "../../utils/audit";
import {
  containsInsensitive,
  fireAndForget,
  formatDateTime,
  round2,
} from "../../utils/helpers";
import { advisoryLock } from "../../utils/lock";
import { buildMeta, getSkipTake } from "../../utils/pagination";
import { assertZoneAccess } from "../../utils/zoneAccess";
import {
  customerIdsFor,
  notifyUsers,
} from "../notification/notification.service";
import type {
  CreateScheduleInput,
  GenerateScheduleInput,
  ListSchedulesQuery,
  RescheduleInput,
} from "./schedule.validator";

const HOUR_MS = 3_600_000;
const PENDING = [ScheduleStatus.SCHEDULED, ScheduleStatus.ACTIVE];

const scheduleSelect = {
  id: true,
  feederId: true,
  areaId: true,
  startTime: true,
  endTime: true,
  type: true,
  status: true,
  reason: true,
  cancelReason: true,
  batchId: true,
  createdAt: true,
  feeder: { select: { id: true, name: true, code: true, priority: true } },
  area: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ScheduledOutageSelect;

// Helpers functions
const notifyAffected = (
  target: { id: string; feederId: string; areaId: string | null },
  title: string,
  message: string,
) =>
  fireAndForget(async () => {
    const ids = await customerIdsFor({
      feederId: target.feederId,
      areaId: target.areaId,
    });
    await notifyUsers(ids, {
      type: "SCHEDULE",
      title,
      message,
      refId: target.id,
    });
  });

const describeWindow = (start: Date, end: Date) =>
  `${formatDateTime(start)} → ${formatDateTime(end)}`;

/** Overlapping */
const findConflicts = (
  tx: Db,
  p: {
    feederId: string;
    areaId?: string | null;
    start: Date;
    end: Date;
    excludeId?: string;
  },
) =>
  tx.scheduledOutage.findMany({
    where: {
      feederId: p.feederId,
      deletedAt: null,
      status: { in: PENDING },
      startTime: { lt: p.end },
      endTime: { gt: p.start },
      ...(p.areaId ? { OR: [{ areaId: null }, { areaId: p.areaId }] } : {}),
      ...(p.excludeId ? { id: { not: p.excludeId } } : {}),
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      type: true,
      areaId: true,
    },
  });

const throwConflict = (
  conflicts: Awaited<ReturnType<typeof findConflicts>>,
): never => {
  throw new AppError(
    409,
    "Schedule conflicts with existing outage(s) on this feeder",
    conflicts,
  );
};

const loadFeeder = async (feederId: string) => {
  const feeder = await prisma.feeder.findFirst({
    where: { id: feederId, deletedAt: null },
    select: { id: true, name: true, substation: { select: { zoneId: true } } },
  });
  if (!feeder) throw new AppError(404, "Feeder not found");
  return feeder;
};
// CRUD
export const create = async (input: CreateScheduleInput, actor: Actor) => {
  const feeder = await loadFeeder(input.feederId);
  await assertZoneAccess(actor, feeder.substation.zoneId);
  if (input.areaId) {
    const area = await prisma.area.findFirst({
      where: { id: input.areaId, feederId: feeder.id, deletedAt: null },
      select: { id: true },
    });
    if (!area)
      throw new AppError(422, "Area does not belong to the selected feeder");
  }

  const created = await prisma.$transaction(async (tx) => {
    await advisoryLock(
      tx as unknown as Parameters<typeof advisoryLock>[0],
      `feeder-schedule:${feeder.id}`,
    );
    const conflicts = await findConflicts(
      tx as unknown as Parameters<typeof findConflicts>[0],
      {
        feederId: feeder.id as string,
        areaId: input.areaId as string | null,
        start: input.startTime,
        end: input.endTime,
      },
    );
    if (conflicts.length) throwConflict(conflicts);

    const row = await tx.scheduledOutage.create({
      data: {
        feederId: feeder.id as string,
        areaId: input.areaId as string | null,
        startTime: input.startTime,
        endTime: input.endTime,
        type: input.type,
        reason: input.reason ?? null,
        createdById: actor.id as string,
      },
      select: scheduleSelect,
    });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "SCHEDULE_CREATED",
      entity: "ScheduledOutage",
      entityId: row.id,
    });
    return row;
  });

  notifyAffected(
    created,
    "Planned power outage",
    `${feeder.name}: ${describeWindow(created.startTime, created.endTime)}. ${input.reason ?? ""}`.trim(),
  );
  return created;
};
// schedule listing
export const list = async (query: ListSchedulesQuery, actor: Actor) => {
  const AND: Prisma.ScheduledOutageWhereInput[] = [{ deletedAt: null }];

  if (actor.role === Role.CUSTOMER) {
    const profile = await prisma.profile.findUnique({
      where: { userId: actor.id as string },
      select: { areaId: true, area: { select: { feederId: true } } },
    });
    if (!profile?.area)
      return { items: [], meta: buildMeta(query.page, query.limit, 0) };
    AND.push({
      feederId: profile.area.feederId,
      OR: [{ areaId: null }, { areaId: profile.areaId }],
    });
  } else if (actor.role === Role.ZONE_MANAGER) {
    AND.push({
      feeder: { substation: { zone: { managerId: actor.id as string } } },
    });
  }

  if (query.status) AND.push({ status: query.status });
  if (query.type) AND.push({ type: query.type });
  if (query.feederId) AND.push({ feederId: query.feederId });
  if (query.areaId)
    AND.push({
      OR: [
        { areaId: query.areaId },
        { areaId: null, feeder: { areas: { some: { id: query.areaId } } } },
      ],
    });
  if (query.zoneId)
    AND.push({ feeder: { substation: { zoneId: query.zoneId as string } } });
  if (query.from || query.to)
    AND.push({
      startTime: {
        ...(query.from !== undefined ? { gte: query.from } : {}),
        ...(query.to !== undefined ? { lte: query.to } : {}),
      },
    });
  if (query.q) AND.push({ reason: containsInsensitive(query.q) });

  const where: Prisma.ScheduledOutageWhereInput = { AND };
  const [items, total] = await Promise.all([
    prisma.scheduledOutage.findMany({
      where,
      select: scheduleSelect,
      orderBy: { [query.sortBy]: query.order },
      ...getSkipTake(query),
    }),
    prisma.scheduledOutage.count({ where }),
  ]);
  return { items, meta: buildMeta(query.page, query.limit, total) };
};

export const syncScheduleStates = async () => {};
