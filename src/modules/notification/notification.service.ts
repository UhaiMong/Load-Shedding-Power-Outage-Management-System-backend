import { type NotificationType, Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/ApiError";
import type { Db } from "../../utils/audit";
import { buildMeta, getSkipTake } from "../../utils/pagination";
// import type { ListNotificationsQuery } from "./notification.validator";

interface Payload {
  type: NotificationType;
  title: string;
  message: string;
  refId?: string;
}

/** Creates one in-app notification per user (deduplicated). */
export const notifyUsers = async (
  userIds: string[],
  payload: Payload,
  db: Db = prisma,
) => {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const { count } = await db.notification.createMany({
    data: ids.map((userId) => ({ userId, ...payload })),
  });
  return count;
};

/** Active customers served by a feeder, or by one specific area when `areaId` is given. */
export const customerIdsFor = async (target: {
  feederId?: string;
  areaId?: string | null;
}) => {
  const areaFilter = target.areaId
    ? { areaId: target.areaId }
    : target.feederId
      ? { area: { feederId: target.feederId, deletedAt: null } }
      : null;
  if (!areaFilter) return [];
  const profiles = await prisma.profile.findMany({
    where: {
      ...areaFilter,
      user: { role: Role.CUSTOMER, isActive: true, deletedAt: null },
    },
    select: { userId: true },
  });
  return profiles.map((p) => p.userId);
};

/** Operators plus the manager of the given zone. */
export const staffIdsForZone = async (zoneId: string) => {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [
        { role: Role.OPERATOR },
        { managedZones: { some: { id: zoneId, deletedAt: null } } },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
};

export const listMine = async (userId: string, query: any) => {
  const where = { userId, ...(query.unreadOnly ? { isRead: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...getSkipTake(query),
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return {
    items,
    meta: { ...buildMeta(query.page, query.limit, total), unreadCount },
  };
};

export const markRead = async (userId: string, id: string) => {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (count === 0) throw new AppError(404, "Notification not found");
  return prisma.notification.findUniqueOrThrow({ where: { id } });
};

export const markAllRead = async (userId: string) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: count };
};
