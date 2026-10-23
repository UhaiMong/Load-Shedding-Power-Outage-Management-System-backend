import type { Prisma } from "../../../generated/prisma/client";
import {
  BillStatus,
  OutageStatus,
  PaymentStatus,
  Role,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import { auth } from "../../lib/auth";
import { cache } from "../../lib/cache";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/ApiError";
import { type Actor, audit } from "../../utils/audit";
import { containsInsensitive } from "../../utils/helpers";
import { buildMeta, getSkipTake } from "../../utils/pagination";
import type {
  AuditLogsQuery,
  CreateStaffInput,
  ListUsersQuery,
  UpdateRoleInput,
} from "./admin.validator";

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  profile: {
    select: {
      phone: true,
      zoneId: true,
      areaId: true,
      isAvailable: true,
      isBusy: true,
    },
  },
} satisfies Prisma.UserSelect;

const assertNotSelf = (actor: Actor, id: string) => {
  if (actor.id === id)
    throw new AppError(
      400,
      "You cannot perform this action on your own account",
    );
};

export const listUsers = async (query: ListUsersQuery) => {
  const where = {
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.q
      ? {
          OR: [
            { name: containsInsensitive(query.q) },
            { email: containsInsensitive(query.q) },
          ],
        }
      : {}),
  } satisfies NonNullable<Parameters<typeof prisma.user.findMany>[0]>["where"];
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { [query.sortBy]: query.order },
      ...getSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);
  return { items, meta: buildMeta(query.page, query.limit, total) };
};

export const getUser = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });
  if (!user) throw new AppError(404, "User not found");
  return user;
};

export const createStaff = async (input: CreateStaffInput, actor: Actor) => {
  if (input.zoneId) {
    const zone = await prisma.zone.findFirst({
      where: { id: input.zoneId, deletedAt: null },
      select: { id: true },
    });
    if (!zone) throw new AppError(404, "Zone not found");
  }
  if (
    await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    })
  ) {
    throw new AppError(409, "An account with this email already exists");
  }

  const { user } = await auth.api.signUpEmail({
    body: { name: input.name, email: input.email, password: input.password },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: input.role, emailVerified: true },
    });
    await tx.profile.create({
      data: {
        userId: user.id,
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.zoneId !== undefined && { zoneId: input.zoneId }),
      },
    });
    // signUp auto-creates a session; staff must log in themselves.
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "STAFF_CREATED",
      entity: "User",
      entityId: user.id,
      metadata: { role: input.role },
    });
  });
  await cache.invalidate("admin:");
  return getUser(user.id);
};

export const updateRole = async (
  id: string,
  input: UpdateRoleInput,
  actor: Actor,
) => {
  assertNotSelf(actor, id);
  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { role: true },
  });
  if (!target) throw new AppError(404, "User not found");

  if (input.zoneId) {
    const zone = await prisma.zone.findFirst({
      where: { id: input.zoneId, deletedAt: null },
      select: { id: true },
    });
    if (!zone) throw new AppError(404, "Zone not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { role: input.role } });
    if (input.zoneId !== undefined) {
      await tx.profile.upsert({
        where: { userId: id },
        create: { userId: id, zoneId: input.zoneId },
        update: { zoneId: input.zoneId },
      });
    }
    // A user who is no longer a zone manager stops managing zones.
    if (target.role === Role.ZONE_MANAGER && input.role !== Role.ZONE_MANAGER) {
      await tx.zone.updateMany({
        where: { managerId: id },
        data: { managerId: null },
      });
    }
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "USER_ROLE_CHANGED",
      entity: "User",
      entityId: id,
      metadata: { from: target.role, to: input.role },
    });
  });
  await cache.invalidate("admin:");
  return getUser(id);
};

export const setStatus = async (
  id: string,
  isActive: boolean,
  actor: Actor,
) => {
  assertNotSelf(actor, id);
  const { count } = await prisma.user.updateMany({
    where: { id, deletedAt: null },
    data: { isActive },
  });
  if (count === 0) throw new AppError(404, "User not found");
  if (!isActive) await prisma.session.deleteMany({ where: { userId: id } });
  await audit(prisma as unknown as Parameters<typeof audit>[0], actor, {
    action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entity: "User",
    entityId: id,
  });
  return getUser(id);
};

export const softDeleteUser = async (id: string, actor: Actor) => {
  assertNotSelf(actor, id);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (count === 0) throw new AppError(404, "User not found");
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx as unknown as Parameters<typeof audit>[0], actor, {
      action: "USER_DELETED",
      entity: "User",
      entityId: id,
    });
  });
  await cache.invalidate("admin:");
  return { deleted: true };
};

export const dashboardStats = () =>
  cache.wrap("admin:dashboard", 30, async () => {
    const now = new Date();
    const [
      usersByRole,
      outagesByStatus,
      activeSchedules,
      upcomingSchedules,
      unpaidBills,
      revenue,
      techs,
      feeders,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["role"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.outage.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.scheduledOutage.count({
        where: { deletedAt: null, status: ScheduleStatus.ACTIVE },
      }),
      prisma.scheduledOutage.count({
        where: {
          deletedAt: null,
          status: ScheduleStatus.SCHEDULED,
          startTime: { gt: now },
        },
      }),
      prisma.bill.aggregate({
        where: { deletedAt: null, status: BillStatus.UNPAID },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.profile.count({
        where: {
          user: { role: Role.TECHNICIAN, isActive: true, deletedAt: null },
          isAvailable: true,
          isBusy: false,
        },
      }),
      prisma.feeder.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const openStatuses: OutageStatus[] = [
      OutageStatus.REPORTED,
      OutageStatus.VERIFIED,
      OutageStatus.ASSIGNED,
      OutageStatus.IN_PROGRESS,
    ];
    return {
      users: Object.fromEntries(
        usersByRole.map((r) => [r.role, r._count._all]),
      ),
      outages: {
        byStatus: Object.fromEntries(
          outagesByStatus.map((r) => [r.status, r._count._all]),
        ),
        open: outagesByStatus
          .filter((r) => openStatuses.includes(r.status))
          .reduce((n, r) => n + r._count._all, 0),
      },
      schedules: { active: activeSchedules, upcoming: upcomingSchedules },
      feeders: Object.fromEntries(
        feeders.map((r) => [r.status, r._count._all]),
      ),
      availableTechnicians: techs,
      billing: {
        unpaidBills: unpaidBills._count._all,
        unpaidAmount: unpaidBills._sum.amount ?? 0,
        completedPayments: revenue._count._all,
        revenue: revenue._sum.amount ?? 0,
      },
      generatedAt: now,
    };
  });

export const listAuditLogs = async (query: AuditLogsQuery) => {
  const where = {
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  } satisfies NonNullable<
    Parameters<typeof prisma.auditLog.findMany>[0]
  >["where"];
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      ...getSkipTake(query),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, meta: buildMeta(query.page, query.limit, total) };
};
