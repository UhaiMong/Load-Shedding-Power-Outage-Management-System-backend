import { Prisma } from "../../../generated/prisma/client";
import { cache } from "../../lib/cache";
import { prisma } from "../../lib/prisma";
import type { AnalyticsQuery } from "./analytics.validator";

const cacheKey = (name: string, q: AnalyticsQuery) =>
  `analytics:${name}:${q.from.toISOString().slice(0, 13)}:${q.to.toISOString().slice(0, 13)}:${q.limit}`;

export const outageSummary = (q: AnalyticsQuery) =>
  cache.wrap(cacheKey("summary", q), 60, async () => {
    const range = { startedAt: { gte: q.from, lte: q.to }, deletedAt: null };
    const [byStatus, bySeverity, timings, schedules] = await Promise.all([
      prisma.outage.groupBy({
        by: ["status"],
        where: range,
        _count: { _all: true },
      }),
      prisma.outage.groupBy({
        by: ["severity"],
        where: range,
        _count: { _all: true },
      }),
      prisma.$queryRaw<
        {
          avgRestorationMinutes: number;
          avgResponseMinutes: number;
          restored: number;
        }[]
      >(Prisma.sql`
        SELECT
          COALESCE(AVG(EXTRACT(EPOCH FROM ("restoredAt" - "startedAt")) / 60) FILTER (WHERE "restoredAt" IS NOT NULL), 0)::float8 AS "avgRestorationMinutes",
          COALESCE(AVG(EXTRACT(EPOCH FROM ("assignedAt" - "startedAt")) / 60) FILTER (WHERE "assignedAt" IS NOT NULL), 0)::float8 AS "avgResponseMinutes",
          COUNT(*) FILTER (WHERE "restoredAt" IS NOT NULL)::int AS "restored"
        FROM outages
        WHERE "deletedAt" IS NULL AND "startedAt" >= ${q.from} AND "startedAt" <= ${q.to}`),
      prisma.scheduledOutage.groupBy({
        by: ["type", "status"],
        where: { deletedAt: null, startTime: { gte: q.from, lte: q.to } },
        _count: { _all: true },
      }),
    ]);
    const t = timings[0];
    return {
      period: { from: q.from, to: q.to },
      totalOutages: byStatus.reduce((n, r) => n + r._count._all, 0),
      byStatus: Object.fromEntries(
        byStatus.map((r) => [r.status, r._count._all]),
      ),
      bySeverity: Object.fromEntries(
        bySeverity.map((r) => [r.severity, r._count._all]),
      ),
      restored: t?.restored ?? 0,
      avgRestorationMinutes:
        Math.round((t?.avgRestorationMinutes ?? 0) * 10) / 10,
      avgResponseMinutes: Math.round((t?.avgResponseMinutes ?? 0) * 10) / 10,
      scheduledOutages: schedules.map((s) => ({
        type: s.type,
        status: s.status,
        count: s._count._all,
      })),
    };
  });

export const areaReliability = (q: AnalyticsQuery) =>
  cache.wrap(cacheKey("areas", q), 60, () =>
    prisma.$queryRaw<unknown[]>(Prisma.sql`
      SELECT a.id AS "areaId", a.name AS "areaName", a.code AS "areaCode",
             COUNT(o.id)::int AS "outageCount",
             COALESCE(SUM(o."reportCount"), 0)::int AS "totalReports",
             COALESCE(AVG(EXTRACT(EPOCH FROM (o."restoredAt" - o."startedAt")) / 60)
               FILTER (WHERE o."restoredAt" IS NOT NULL), 0)::float8 AS "avgRestorationMinutes"
      FROM outages o
      JOIN areas a ON a.id = o."areaId"
      WHERE o."deletedAt" IS NULL AND o."startedAt" >= ${q.from} AND o."startedAt" <= ${q.to}
      GROUP BY a.id, a.name, a.code
      ORDER BY "outageCount" DESC, "avgRestorationMinutes" DESC
      LIMIT ${q.limit}`),
  );

export const technicianPerformance = (q: AnalyticsQuery) =>
  cache.wrap(cacheKey("technicians", q), 60, () =>
    prisma.$queryRaw<unknown[]>(Prisma.sql`
      SELECT u.id AS "technicianId", u.name AS "technicianName",
             COUNT(o.id)::int AS "jobs",
             COUNT(o.id) FILTER (WHERE o."restoredAt" IS NOT NULL)::int AS "completed",
             COALESCE(AVG(EXTRACT(EPOCH FROM (o."restoredAt" - o."repairStartedAt")) / 60)
               FILTER (WHERE o."restoredAt" IS NOT NULL AND o."repairStartedAt" IS NOT NULL), 0)::float8 AS "avgRepairMinutes"
      FROM outages o
      JOIN users u ON u.id = o."technicianId"
      WHERE o."deletedAt" IS NULL AND o."startedAt" >= ${q.from} AND o."startedAt" <= ${q.to}
      GROUP BY u.id, u.name
      ORDER BY "completed" DESC
      LIMIT ${q.limit}`),
  );
