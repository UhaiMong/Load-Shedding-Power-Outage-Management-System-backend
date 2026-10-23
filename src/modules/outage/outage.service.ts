import type { Prisma } from "../../../generated/prisma/client";
import { OutageStatus, Role, ScheduleStatus } from "../../../generated/prisma/enums";
import { uploadImage } from "../../lib/cloudinary";
import { sendMail } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/ApiError";
import { type Actor, audit, type Db } from "../../utils/audit";
import {
  containsInsensitive,
  fireAndForget,
  formatDateTime,
  generateTicketNo,
} from "../../utils/helpers";
import { advisoryLock } from "../../utils/lock";
import { buildMeta, getSkipTake } from "../../utils/pagination";
import { assertZoneAccess } from "../../utils/zoneAccess";
import {
  customerIdsFor,
  notifyUsers,
  staffIdsForZone,
} from "../notification/notification.service";
import type {
  ListOutagesQuery,
  ReportOutageInput,
  UpdateStatusInput,
  VerifyOutageInput,
} from "./outage.validator";

const OPEN: OutageStatus[] = [
  OutageStatus.REPORTED,
  OutageStatus.VERIFIED,
  OutageStatus.ASSIGNED,
  OutageStatus.IN_PROGRESS,
];

/** Outage lifecycle: REPORTED → VERIFIED → ASSIGNED → IN_PROGRESS → RESTORED (REJECTED from REPORTED/VERIFIED). */
const TRANSITIONS: Record<OutageStatus, OutageStatus[]> = {
  REPORTED: ["VERIFIED", "REJECTED"],
  VERIFIED: ["ASSIGNED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS", "ASSIGNED"],
  IN_PROGRESS: ["RESTORED"],
  RESTORED: [],
  REJECTED: [],
};

const outageSelect = {
  id: true,
  ticketNo: true,
  status: true,
  severity: true,
  description: true,
  cause: true,
  reportCount: true,
  startedAt: true,
  verifiedAt: true,
  assignedAt: true,
  repairStartedAt: true,
  restoredAt: true,
  estimatedRestorationAt: true,
  resolutionNotes: true,
  area: {
    select: {
      id: true,
      name: true,
      code: true,
      feeder: { select: { id: true, name: true, code: true } },
    },
  },
  technician: { select: { id: true, name: true } },
} satisfies Prisma.OutageSelect;

const findOutage = async (db: Db, id: string) => {
  const outage = await db.outage.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      ticketNo: true,
      status: true,
      areaId: true,
      technicianId: true,
      area: {
        select: {
          name: true,
          feeder: { select: { substation: { select: { zoneId: true } } } },
        },
      },
    },
  });
  if (!outage) throw new AppError(404, "Outage not found");
  return { ...outage, zoneId: outage.area.feeder.substation.zoneId };
};

/** Guarded status change: fails if the state machine forbids it or another request changed the row first. */
const moveStatus = async (
  tx: Db,
  outage: { id: string; status: OutageStatus },
  to: OutageStatus,
  data: Prisma.OutageUncheckedUpdateManyInput = {},
) => {
  if (!TRANSITIONS[outage.status].includes(to)) {
    throw new AppError(409, `Invalid transition: ${outage.status} → ${to}`);
  }
  const { count } = await tx.outage.updateMany({
    where: { id: outage.id, status: outage.status, deletedAt: null },
    data: { ...data, status: to },
  });
  if (count !== 1)
    throw new AppError(
      409,
      "Outage was modified by another request. Please retry",
    );
};

const scopeFor = async (actor: Actor): Promise<Prisma.OutageWhereInput> => {
  switch (actor.role) {
    case Role.CUSTOMER: {
      const profile = await prisma.profile.findUnique({
        where: { userId: actor.id as string },
        select: { areaId: true },
      });
      const own: Prisma.OutageWhereInput = {
        reports: { some: { reporterId: actor.id as string } },
      };
      return profile?.areaId ? { OR: [{ areaId: profile.areaId }, own] } : own;
    }
    case Role.TECHNICIAN:
      return { technicianId: actor.id as string };
    case Role.ZONE_MANAGER:
      return {
        area: {
          feeder: { substation: { zone: { managerId: actor.id as string } } },
        },
      };
    default:
      return {};
  }
};

// report
export const report = async (
  input: ReportOutageInput,
  file: Express.Multer.File | undefined,
  actor: Actor,
) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: actor.id as string },
    select: { areaId: true },
  });
  const areaId = input.areaId ?? profile?.areaId;
  if (!areaId)
    throw new AppError(
      422,
      "areaId is required (no area is set on your profile)",
    );

  const area = await prisma.area.findFirst({
    where: { id: areaId, deletedAt: null },
    select: {
      id: true,
      name: true,
      feeder: {
        select: {
          id: true,
          priority: true,
          substation: { select: { zoneId: true } },
        },
      },
    },
  });
  if (!area) throw new AppError(404, "Area not found");

  const imageUrl = file
    ? await uploadImage(file.buffer, "outage-reports")
    : undefined;

  const { outage, isNew } = await prisma.$transaction(async (tx) => {
    await advisoryLock(
      tx as unknown as Parameters<typeof advisoryLock>[0],
      `outage-area:${area.id}`,
    );

    // A planned outage covering this area right now is not a fault.
    const now = new Date();
    const planned = await tx.scheduledOutage.findFirst({
      where: {
        deletedAt: null,
        feederId: area.feeder.id,
        status: { in: [ScheduleStatus.SCHEDULED, ScheduleStatus.ACTIVE] },
        startTime: { lte: now },
        endTime: { gt: now },
        OR: [{ areaId: null }, { areaId: area.id }],
      },
      select: { endTime: true },
    });
    if (planned) {
      throw new AppError(
        409,
        `This area is under a planned outage until ${formatDateTime(planned.endTime)}`,
      );
    }

    const open = await tx.outage.findFirst({
      where: { areaId: area.id, deletedAt: null, status: { in: OPEN } },
      select: { id: true, ticketNo: true },
    });

    if (open) {
      const duplicate = await tx.outageReport.findUnique({
        where: {
          outageId_reporterId: {
            outageId: open.id,
            reporterId: actor.id as string,
          },
        },
        select: { id: true },
      });
      if (duplicate)
        throw new AppError(
          409,
          `You have already reported this outage (ticket ${open.ticketNo})`,
        );
      await tx.outageReport.create({
        data: {
          outageId: open.id,
          reporterId: actor.id as string,
          description: input.description,
          ...(imageUrl !== undefined ? { imageUrl } : {}),
        },
      });
      const updated = await tx.outage.update({
        where: { id: open.id },
        data: { reportCount: { increment: 1 } },
        select: outageSelect,
      });
      await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
        action: "OUTAGE_REPORT_ADDED",
        entity: "Outage",
        entityId: open.id,
      });
      return { outage: updated, isNew: false };
    }

    const created = await tx.outage.create({
      data: {
        ticketNo: generateTicketNo(),
        areaId: area.id,
        severity: area.feeder.priority, // priority-based: critical areas escalate automatically
        description: input.description,
        reports: {
          create: {
            reporterId: actor.id as string,
            description: input.description,
            ...(imageUrl !== undefined ? { imageUrl } : {}),
          },
        },
      },
      select: outageSelect,
    });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "OUTAGE_REPORTED",
      entity: "Outage",
      entityId: created.id,
    });
    return { outage: created, isNew: true };
  });

  if (isNew) {
    fireAndForget(async () => {
      const staff = await staffIdsForZone(area.feeder.substation.zoneId);
      await notifyUsers(staff, {
        type: "OUTAGE",
        title: `New outage ${outage.ticketNo}`,
        message: `${area.name}: ${input.description.slice(0, 120)}`,
        refId: outage.id,
      });
    });
  }
  return { ...outage, isNew };
};

// read
export const list = async (
  query: ListOutagesQuery,
  actor: Actor,
  extra: Prisma.OutageWhereInput = {},
) => {
  const AND: Prisma.OutageWhereInput[] = [
    { deletedAt: null },
    await scopeFor(actor),
    extra,
  ];
  if (query.status) AND.push({ status: query.status });
  if (query.severity) AND.push({ severity: query.severity });
  if (query.areaId) AND.push({ areaId: query.areaId });
  if (query.zoneId)
    AND.push({ area: { feeder: { substation: { zoneId: query.zoneId } } } });
  if (query.technicianId) AND.push({ technicianId: query.technicianId });
  if (query.from || query.to)
    AND.push({
      startedAt: {
        ...(query.from !== undefined ? { gte: query.from } : {}),
        ...(query.to !== undefined ? { lte: query.to } : {}),
      },
    });
  if (query.q) {
    AND.push({
      OR: [
        { ticketNo: containsInsensitive(query.q) },
        { description: containsInsensitive(query.q) },
        { area: { name: containsInsensitive(query.q) } },
      ],
    });
  }
  const where = { AND } as Prisma.OutageWhereInput;
  const [items, total] = await Promise.all([
    prisma.outage.findMany({
      where,
      select: outageSelect,
      orderBy: { [query.sortBy]: query.order },
      ...getSkipTake(query),
    }),
    prisma.outage.count({ where }),
  ]);
  return { items, meta: buildMeta(query.page, query.limit, total) };
};

export const myAssigned = (query: ListOutagesQuery, actor: Actor) =>
  list(query, actor, { technicianId: actor.id as string });
export const myReports = (query: ListOutagesQuery, actor: Actor) =>
  list(query, actor, { reports: { some: { reporterId: actor.id as string } } });

export const getById = async (id: string, actor: Actor) => {
  const outage = await prisma.outage.findFirst({
    where: {
      AND: [{ id, deletedAt: null }, await scopeFor(actor)],
    },
    select: {
      ...outageSelect,
      reports: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          description: true,
          imageUrl: true,
          createdAt: true,
          reporter: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!outage) throw new AppError(404, "Outage not found");
  return outage;
};

export const timeline = async (id: string, actor: Actor) => {
  await getById(id, actor);
  return prisma.auditLog.findMany({
    where: { entity: "Outage", entityId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true, role: true } },
    },
  });
};

// operator workflow
const notifyReporters = async (
  outageId: string,
  title: string,
  message: string,
  withEmail = false,
) => {
  const reports = await prisma.outageReport.findMany({
    where: { outageId },
    select: { reporter: { select: { id: true, email: true } } },
  });
  await notifyUsers(
    reports.map((r) => r.reporter.id),
    { type: "OUTAGE", title, message, refId: outageId },
  );
  if (withEmail)
    await sendMail(
      reports.map((r) => r.reporter.email),
      title,
      message,
    );
};

export const verify = async (
  id: string,
  input: VerifyOutageInput,
  actor: Actor,
) => {
  const result = await prisma.$transaction(async (tx) => {
    const outage = await findOutage(
      tx as unknown as Parameters<typeof findOutage>[0],
      id,
    );
    await assertZoneAccess(actor, outage.zoneId);
    await moveStatus(
      tx as unknown as Parameters<typeof moveStatus>[0],
      outage,
      OutageStatus.VERIFIED,
      {
        verifiedAt: new Date(),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.cause ? { cause: input.cause } : {}),
        ...(input.estimatedRestorationAt
          ? { estimatedRestorationAt: input.estimatedRestorationAt }
          : {}),
      },
    );
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "OUTAGE_VERIFIED",
      entity: "Outage",
      entityId: id,
    });
    return {
      outage,
      data: await tx.outage.findUniqueOrThrow({
        where: { id },
        select: outageSelect,
      }),
    };
  });
  fireAndForget(() =>
    notifyReporters(
      id,
      `Outage ${result.outage.ticketNo} verified`,
      "Your report was verified. A technician will be assigned shortly.",
    ),
  );
  return result.data;
};

export const reject = async (id: string, reason: string, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    const outage = await findOutage(
      tx as unknown as Parameters<typeof findOutage>[0],
      id,
    );
    await assertZoneAccess(actor, outage.zoneId);
    await moveStatus(
      tx as unknown as Parameters<typeof moveStatus>[0],
      outage,
      OutageStatus.REJECTED,
      { resolutionNotes: reason },
    );
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "OUTAGE_REJECTED",
      entity: "Outage",
      entityId: id,
      metadata: { reason },
    });
    return {
      outage,
      data: await tx.outage.findUniqueOrThrow({
        where: { id },
        select: outageSelect,
      }),
    };
  });
  fireAndForget(() =>
    notifyReporters(
      id,
      `Outage ${result.outage.ticketNo} closed`,
      `Report rejected: ${reason}`,
    ),
  );
  return result.data;
};

const TECH_UNAVAILABLE = "TECHNICIAN_UNAVAILABLE";

/** Atomic assignment */
const assignInTx = async (id: string, technicianId: string, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    const outage = await findOutage(
      tx as unknown as Parameters<typeof findOutage>[0],
      id,
    );
    await assertZoneAccess(actor, outage.zoneId);
    if (outage.technicianId === technicianId)
      throw new AppError(409, "Technician is already assigned to this outage");

    const tech = await tx.user.findFirst({
      where: {
        id: technicianId,
        role: Role.TECHNICIAN,
        isActive: true,
        deletedAt: null,
      },
      select: {
        name: true,
        email: true,
        profile: { select: { zoneId: true } },
      },
    });
    if (!tech) throw new AppError(404, "Technician not found");
    if (tech.profile?.zoneId && tech.profile.zoneId !== outage.zoneId) {
      throw new AppError(422, "Technician is assigned to a different zone");
    }

    // Compare-and-set: only succeeds if the technician is on duty and not already on a job.
    const claim = await tx.profile.updateMany({
      where: { userId: technicianId, isAvailable: true, isBusy: false },
      data: { isBusy: true },
    });
    if (claim.count === 0)
      throw new AppError(409, "Technician is not available", [
        { code: TECH_UNAVAILABLE },
      ]);

    await moveStatus(
      tx as unknown as Parameters<typeof moveStatus>[0],
      outage,
      OutageStatus.ASSIGNED,
      { technicianId, assignedAt: new Date() },
    );
    if (outage.technicianId) {
      await tx.profile.updateMany({
        where: { userId: outage.technicianId },
        data: { isBusy: false },
      });
    }
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: outage.technicianId ? "OUTAGE_REASSIGNED" : "OUTAGE_ASSIGNED",
      entity: "Outage",
      entityId: id,
      metadata: { technicianId, previousTechnicianId: outage.technicianId },
    });
    return {
      outage,
      tech,
      data: await tx.outage.findUniqueOrThrow({
        where: { id },
        select: outageSelect,
      }),
    };
  });

  fireAndForget(async () => {
    const message = `${result.data.area.name}: ${result.data.description ?? "Outage repair"}`;
    await notifyUsers([technicianId], {
      type: "ASSIGNMENT",
      title: `Assigned: ${result.outage.ticketNo}`,
      message,
      refId: id,
    });
    await sendMail(
      result.tech.email,
      `Outage assignment ${result.outage.ticketNo}`,
      message,
    );
    await notifyReporters(
      id,
      `Outage ${result.outage.ticketNo}: technician assigned`,
      `${result.tech.name} is assigned to restore power.`,
    );
  });
  return result.data;
};

export const assign = (id: string, technicianId: string, actor: Actor) =>
  assignInTx(id, technicianId, actor);

/** Picks the longest-idle available technician in the outage's zone */
export const autoAssign = async (id: string, actor: Actor) => {
  const outage = await findOutage(
    prisma as unknown as Parameters<typeof findOutage>[0],
    id,
  );
  await assertZoneAccess(actor, outage.zoneId);
  if (outage.status !== OutageStatus.VERIFIED)
    throw new AppError(409, "Only VERIFIED outages can be auto-assigned");

  const candidates = await prisma.user.findMany({
    where: {
      role: Role.TECHNICIAN,
      isActive: true,
      deletedAt: null,
      profile: {
        is: {
          isAvailable: true,
          isBusy: false,
          OR: [{ zoneId: outage.zoneId }, { zoneId: null }],
        },
      },
    },
    orderBy: { profile: { updatedAt: "asc" } },
    select: { id: true },
    take: 10,
  });
  if (candidates.length === 0)
    throw new AppError(409, "No available technician in this zone");

  for (const candidate of candidates) {
    try {
      return await assignInTx(id, candidate.id, actor);
    } catch (err) {
      const unavailable =
        err instanceof AppError &&
        (err.errors[0] as { code?: string } | undefined)?.code ===
          TECH_UNAVAILABLE;
      if (!unavailable) throw err;
    }
  }
  throw new AppError(
    409,
    "All candidate technicians became busy. Please retry",
  );
};

// technician workflow
export const updateStatus = async (
  id: string,
  input: UpdateStatusInput,
  actor: Actor,
) => {
  const result = await prisma.$transaction(async (tx) => {
    const outage = await findOutage(
      tx as unknown as Parameters<typeof findOutage>[0],
      id,
    );
    if (outage.technicianId !== actor.id)
      throw new AppError(403, "This outage is not assigned to you");

    const now = new Date();
    if (input.status === "IN_PROGRESS") {
      await moveStatus(
        tx as unknown as Parameters<typeof moveStatus>[0],
        outage,
        OutageStatus.IN_PROGRESS,
        { repairStartedAt: now },
      );
    } else {
      await moveStatus(
        tx as unknown as Parameters<typeof moveStatus>[0],
        outage,
        OutageStatus.RESTORED,
        {
          restoredAt: now,
          ...(input.notes !== undefined
            ? { resolutionNotes: input.notes }
            : {}),
          ...(input.cause ? { cause: input.cause } : {}),
        },
      );
      await tx.profile.updateMany({
        where: { userId: actor.id as string },
        data: { isBusy: false },
      });
    }
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: `OUTAGE_${input.status}`,
      entity: "Outage",
      entityId: id,
      metadata: { notes: input.notes },
    });
    return {
      outage,
      data: await tx.outage.findUniqueOrThrow({
        where: { id },
        select: outageSelect,
      }),
    };
  });

  if (input.status === "RESTORED") {
    fireAndForget(async () => {
      const title = `Power restored (${result.outage.ticketNo})`;
      const message = `Supply in ${result.outage.area.name} has been restored.`;
      const ids = await customerIdsFor({ areaId: result.outage.areaId });
      await notifyUsers(ids, { type: "OUTAGE", title, message, refId: id });
      await notifyReporters(id, title, message, true);
    });
  }
  return result.data;
};

export const softDelete = async (id: string, actor: Actor) => {
  const { count } = await prisma.outage.updateMany({
    where: {
      id,
      deletedAt: null,
      status: { in: [OutageStatus.RESTORED, OutageStatus.REJECTED] },
    },
    data: { deletedAt: new Date() },
  });
  if (count === 0)
    throw new AppError(
      409,
      "Outage not found or still open (only RESTORED/REJECTED can be deleted)",
    );
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: "OUTAGE_DELETED",
    entity: "Outage",
    entityId: id,
  });
  return { deleted: true };
};
