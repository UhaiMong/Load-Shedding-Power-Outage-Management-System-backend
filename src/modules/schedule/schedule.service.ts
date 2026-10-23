import { randomUUID } from "node:crypto";
import type { Prisma } from "@generated/prisma/client";
import {
  PriorityLevel,
  Role,
  ScheduleStatus,
  ScheduleType,
} from "@generated/prisma/client";
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
const restoreFeedersIfIdle = async (feederIds: string[]) => {
  const ids = [...new Set(feederIds)];
  if (ids.length === 0) return;
  const stillActive = await prisma.scheduledOutage.findMany({
    where: {
      feederId: { in: ids },
      status: ScheduleStatus.ACTIVE,
      areaId: null,
      deletedAt: null,
    },
    select: { feederId: true },
  });
  const busy = new Set(stillActive.map((s) => s.feederId));
  const restore = ids.filter((id) => !busy.has(id));
  if (restore.length) {
    await prisma.feeder.updateMany({
      where: { id: { in: restore }, status: "DE_ENERGIZED" },
      data: { status: "ENERGIZED" },
    });
  }
};

const getScheduleForActor = async (id: string) => {
  const row = await prisma.scheduledOutage.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...scheduleSelect,
      feeder: {
        select: {
          id: true,
          name: true,
          code: true,
          priority: true,
          substation: { select: { zoneId: true } },
        },
      },
    },
  });
  if (!row) throw new AppError(404, "Scheduled outage not found");
  return row;
};

// automated generation
const PRIORITY_WEIGHT: Record<PriorityLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

interface Busy {
  start: Date;
  end: Date;
  shedding: boolean;
}

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
  type ScheduleWhere = NonNullable<
    NonNullable<Parameters<typeof prisma.scheduledOutage.findMany>[0]>["where"]
  >;
  const AND: ScheduleWhere[] = [{ deletedAt: null }];

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

  const where: ScheduleWhere = { AND };
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

export const getById = async (id: string, actor: Actor) => {
  const { feeder, ...row } = await getScheduleForActor(id);
  if (actor.role === Role.ZONE_MANAGER)
    await assertZoneAccess(actor, feeder.substation.zoneId);
  return {
    ...row,
    feeder: {
      id: feeder.id,
      name: feeder.name,
      code: feeder.code,
      priority: feeder.priority,
    },
  };
};

// Reschedule
export const reschedule = async (
  id: string,
  input: RescheduleInput,
  actor: Actor,
) => {
  const current = await getScheduleForActor(id);
  await assertZoneAccess(actor, current.feeder.substation.zoneId);
  if (current.status !== ScheduleStatus.SCHEDULED)
    throw new AppError(409, "Only SCHEDULED outages can be changed");

  const start = input.startTime ?? current.startTime;
  const end = input.endTime ?? current.endTime;
  if (end <= start) throw new AppError(400, "endTime must be after startTime");
  if (end.getTime() - start.getTime() > 24 * HOUR_MS)
    throw new AppError(400, "An outage cannot be longer than 24 hours");
  if (end.getTime() <= Date.now())
    throw new AppError(400, "endTime must be in the future");

  const updated = await prisma.$transaction(async (tx) => {
    await advisoryLock(
      tx as unknown as Parameters<typeof advisoryLock>[0],
      `feeder-schedule:${current.feederId}`,
    );
    const conflicts = await findConflicts(
      tx as unknown as Parameters<typeof findConflicts>[0],
      {
        feederId: current.feederId,
        areaId: current.areaId,
        start,
        end,
        excludeId: id,
      },
    );
    if (conflicts.length) throwConflict(conflicts);

    const { count } = await tx.scheduledOutage.updateMany({
      where: { id, status: ScheduleStatus.SCHEDULED, deletedAt: null },
      data: {
        startTime: start,
        endTime: end,
        reason: input.reason ?? current.reason,
      },
    });
    if (count !== 1)
      throw new AppError(
        409,
        "Outage changed state while updating. Please retry",
      );
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "SCHEDULE_RESCHEDULED",
      entity: "ScheduledOutage",
      entityId: id,
      metadata: {
        from: describeWindow(current.startTime, current.endTime),
        to: describeWindow(start, end),
      },
    });
    return tx.scheduledOutage.findUniqueOrThrow({
      where: { id },
      select: scheduleSelect,
    });
  });

  notifyAffected(
    updated,
    "Planned outage rescheduled",
    `${current.feeder.name}: now ${describeWindow(start, end)}`,
  );
  return updated;
};

// Cancel schedule
export const cancel = async (id: string, reason: string, actor: Actor) => {
  const current = await getScheduleForActor(id);
  await assertZoneAccess(actor, current.feeder.substation.zoneId);

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.scheduledOutage.updateMany({
      where: { id, status: { in: PENDING }, deletedAt: null },
      data: { status: ScheduleStatus.CANCELLED, cancelReason: reason },
    });
    if (count !== 1)
      throw new AppError(
        409,
        `Cannot cancel an outage that is ${current.status}`,
      );
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "SCHEDULE_CANCELLED",
      entity: "ScheduledOutage",
      entityId: id,
      metadata: { reason },
    });
    return tx.scheduledOutage.findUniqueOrThrow({
      where: { id },
      select: scheduleSelect,
    });
  });

  if (current.status === ScheduleStatus.ACTIVE && !current.areaId)
    await restoreFeedersIfIdle([current.feederId]);
  notifyAffected(
    updated,
    "Planned outage cancelled",
    `${current.feeder.name}: ${describeWindow(current.startTime, current.endTime)} was cancelled. ${reason}`,
  );
  return updated;
};

// Soft delete
export const softDelete = async (id: string, actor: Actor) => {
  const { count } = await prisma.scheduledOutage.updateMany({
    where: { id, deletedAt: null, status: { not: ScheduleStatus.ACTIVE } },
    data: { deletedAt: new Date() },
  });
  if (count === 0)
    throw new AppError(
      409,
      "Outage not found or currently ACTIVE (cancel it first)",
    );
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "SCHEDULE_DELETED",
    entity: "ScheduledOutage",
    entityId: id,
  });
  return { deleted: true };
};

// Priority based fairness-aware generator
export const generate = async (input: GenerateScheduleInput, actor: Actor) => {
  await assertZoneAccess(actor, input.zoneId);

  const [y, m, d] = input.date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const dayStart = new Date(
    Date.UTC(y, m - 1, d) - input.utcOffsetMinutes * 60_000,
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * HOUR_MS);
  const historyStart = new Date(dayStart.getTime() - 7 * 24 * HOUR_MS);

  const slots: { start: Date; end: Date }[] = [];
  for (
    let h = input.startHour;
    h + input.slotHours <= input.endHour;
    h += input.slotHours
  ) {
    slots.push({
      start: new Date(dayStart.getTime() + h * HOUR_MS),
      end: new Date(dayStart.getTime() + (h + input.slotHours) * HOUR_MS),
    });
  }
  if (slots.length === 0)
    throw new AppError(400, "No slots fit in the requested window");
  const lastSlot = slots[slots.length - 1];
  if (lastSlot && lastSlot.end.getTime() <= Date.now())
    throw new AppError(400, "Cannot generate a schedule in the past");

  const batchId = randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    await advisoryLock(
      tx as unknown as Parameters<typeof advisoryLock>[0],
      `schedule-generation:${input.zoneId}`,
    );

    const zone = await tx.zone.findFirst({
      where: { id: input.zoneId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!zone) throw new AppError(404, "Zone not found");

    const feeders = await tx.feeder.findMany({
      where: {
        deletedAt: null,
        loadMw: { gt: 0 },
        status: { not: "FAULTED" },
        priority: { not: PriorityLevel.CRITICAL },
        substation: { zoneId: input.zoneId, deletedAt: null },
      },
      select: {
        id: true,
        name: true,
        code: true,
        loadMw: true,
        priority: true,
      },
    });
    if (feeders.length === 0)
      throw new AppError(
        422,
        "No sheddable feeders (non-critical, loaded, healthy) in this zone",
      );

    const existing = await tx.scheduledOutage.findMany({
      where: {
        feederId: { in: feeders.map((f) => f.id) },
        deletedAt: null,
        status: {
          in: [
            ScheduleStatus.SCHEDULED,
            ScheduleStatus.ACTIVE,
            ScheduleStatus.COMPLETED,
          ],
        },
        endTime: { gt: historyStart },
        startTime: { lt: dayEnd },
      },
      select: { feederId: true, startTime: true, endTime: true, type: true },
    });

    const overlapHours = (aS: Date, aE: Date, bS: Date, bE: Date) =>
      Math.max(
        0,
        Math.min(aE.getTime(), bE.getTime()) -
          Math.max(aS.getTime(), bS.getTime()),
      ) / HOUR_MS;

    type FeederState = (typeof feeders)[number] & {
      history: number;
      today: number;
      busy: Busy[];
    };
    const state = new Map<string, FeederState>(
      feeders.map((f): [string, FeederState] => [
        f.id,
        { ...f, history: 0, today: 0, busy: [] },
      ]),
    );
    for (const o of existing) {
      const f = state.get(o.feederId);
      if (!f) continue;
      const shedding = o.type === ScheduleType.LOAD_SHEDDING;
      if (shedding) {
        f.history += overlapHours(
          o.startTime,
          o.endTime,
          historyStart,
          dayStart,
        );
        f.today += overlapHours(o.startTime, o.endTime, dayStart, dayEnd);
      }
      if (o.startTime < dayEnd && o.endTime > dayStart)
        f.busy.push({ start: o.startTime, end: o.endTime, shedding });
    }

    let previous = new Set<string>();
    const plan = slots.map((slot) => {
      const overlaps = (b: Busy) => b.start < slot.end && b.end > slot.start;
      const all = [...state.values()];

      // Load already being shed in this slot by pre-existing load-shedding outages.
      const alreadyShed = all
        .filter((f) => f.busy.some((b) => b.shedding && overlaps(b)))
        .reduce((s, f) => s + f.loadMw, 0);

      const candidates = all
        .filter(
          (f) =>
            f.today + input.slotHours <= input.maxShedHoursPerFeeder &&
            !f.busy.some(overlaps),
        )
        .sort(
          (a, b) =>
            PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
            Number(previous.has(a.id)) - Number(previous.has(b.id)) ||
            a.history + a.today - (b.history + b.today) ||
            b.loadMw - a.loadMw,
        );

      let shed = alreadyShed;
      const chosen: typeof candidates = [];
      for (const f of candidates) {
        if (shed >= input.deficitMw) break;
        chosen.push(f);
        shed += f.loadMw;
        f.today += input.slotHours;
      }
      previous = new Set(chosen.map((f) => f.id));

      return {
        startTime: slot.start,
        endTime: slot.end,
        shedMw: round2(shed),
        unmetDeficitMw: round2(Math.max(0, input.deficitMw - shed)),
        feeders: chosen.map((f) => ({
          feederId: f.id,
          code: f.code,
          name: f.name,
          priority: f.priority,
          loadMw: f.loadMw,
        })),
      };
    });

    const rows = plan.flatMap((slot) =>
      slot.feeders.map((f) => ({
        feederId: f.feederId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        type: ScheduleType.LOAD_SHEDDING,
        reason: input.reason,
        batchId,
        createdById: actor.id == null ? null : String(actor.id),
      })),
    );

    if (!input.dryRun && rows.length > 0) {
      await tx.scheduledOutage.createMany({ data: rows });
      await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
        action: "SCHEDULE_GENERATED",
        entity: "ScheduledOutage",
        entityId: batchId as string,
        metadata: {
          zoneId: input.zoneId as string,
          date: input.date as string,
          deficitMw: input.deficitMw,
          created: rows.length,
        },
      });
    }

    return {
      batchId: input.dryRun ? null : batchId,
      dryRun: input.dryRun,
      zone,
      date: input.date,
      deficitMw: input.deficitMw,
      summary: {
        slots: plan.length,
        outagesCreated: input.dryRun ? 0 : rows.length,
        outagesPlanned: rows.length,
        slotsWithUnmetDeficit: plan.filter((p) => p.unmetDeficitMw > 0).length,
        protectedFeeders: "CRITICAL priority feeders are never shed",
      },
      plan,
      rows,
    };
  });

  if (!input.dryRun && result.rows.length > 0) {
    fireAndForget(async () => {
      const created = await prisma.scheduledOutage.findMany({
        where: { batchId },
        select: {
          id: true,
          feederId: true,
          startTime: true,
          endTime: true,
          feeder: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
      });
      const byFeeder = Map.groupBy(created, (c) => c.feederId);
      for (const [feederId, items] of byFeeder) {
        const windows = items
          .map((i) => describeWindow(i.startTime, i.endTime))
          .join("; ");
        const ids = await customerIdsFor({ feederId });
        await notifyUsers(ids, {
          type: "SCHEDULE",
          title: "Load-shedding schedule published",
          message: `${items[0]?.feeder.name}: ${windows}`,
          refId: batchId,
        });
      }
    });
  }

  const { rows: _rows, ...response } = result;
  return response;
};

//  state machine (background job)
export const syncScheduleStates = async () => {
  const now = new Date();

  const due = await prisma.scheduledOutage.findMany({
    where: {
      deletedAt: null,
      status: ScheduleStatus.SCHEDULED,
      startTime: { lte: now },
      endTime: { gt: now },
    },
    select: { id: true, feederId: true, areaId: true },
  });
  if (due.length) {
    await prisma.$transaction([
      prisma.scheduledOutage.updateMany({
        where: {
          id: { in: due.map((d) => d.id) },
          status: ScheduleStatus.SCHEDULED,
        },
        data: { status: ScheduleStatus.ACTIVE },
      }),
      prisma.feeder.updateMany({
        where: {
          id: { in: due.filter((d) => !d.areaId).map((d) => d.feederId) },
          status: "ENERGIZED",
        },
        data: { status: "DE_ENERGIZED" },
      }),
    ]);
  }

  const finished = await prisma.scheduledOutage.findMany({
    where: { deletedAt: null, status: { in: PENDING }, endTime: { lte: now } },
    select: { id: true, feederId: true, areaId: true, status: true },
  });
  if (finished.length) {
    await prisma.scheduledOutage.updateMany({
      where: { id: { in: finished.map((f) => f.id) }, status: { in: PENDING } },
      data: { status: ScheduleStatus.COMPLETED },
    });
    await restoreFeedersIfIdle(
      finished
        .filter((f) => f.status === ScheduleStatus.ACTIVE && !f.areaId)
        .map((f) => f.feederId),
    );
  }

  return { activated: due.length, completed: finished.length };
};
