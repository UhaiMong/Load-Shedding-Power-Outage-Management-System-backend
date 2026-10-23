import { ScheduleStatus, ScheduleType } from "../../../generated/prisma/enums";
import { z } from "zod";
import { paginationSchema } from "../../utils/pagination";

export const idParamSchema = z.object({ id: z.string().min(1) });

const HOUR_MS = 3_600_000;

export const createScheduleSchema = z
  .object({
    feederId: z.string().min(1),
    areaId: z.string().min(1).optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    type: z.enum(ScheduleType).default("LOAD_SHEDDING"),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((s) => s.endTime > s.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  })
  .refine((s) => s.endTime.getTime() - s.startTime.getTime() <= 24 * HOUR_MS, {
    message: "An outage cannot be longer than 24 hours",
    path: ["endTime"],
  })
  .refine((s) => s.endTime.getTime() > Date.now(), {
    message: "endTime must be in the future",
    path: ["endTime"],
  });
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const rescheduleSchema = z
  .object({
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    reason: z.string().trim().max(500),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "At least one field is required");
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const cancelScheduleSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const generateScheduleSchema = z
  .object({
    zoneId: z.string().min(1),
    date: z.iso.date(),
    deficitMw: z.number().positive(),
    startHour: z.number().int().min(0).max(23).default(8),
    endHour: z.number().int().min(1).max(24).default(22),
    slotHours: z.number().int().min(1).max(6).default(2),
    maxShedHoursPerFeeder: z.number().int().min(1).max(12).default(4),
    utcOffsetMinutes: z.number().int().min(-720).max(840).default(360),
    dryRun: z.boolean().default(false),
    reason: z
      .string()
      .trim()
      .max(500)
      .default("Automated load-shedding schedule"),
  })
  .refine((g) => g.endHour - g.startHour >= g.slotHours, {
    message:
      "The window between startHour and endHour must fit at least one slot",
    path: ["endHour"],
  });
export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;

export const listSchedulesQuery = paginationSchema.extend({
  status: z.enum(ScheduleStatus).optional(),
  type: z.enum(ScheduleType).optional(),
  feederId: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
  sortBy: z.enum(["startTime", "createdAt"]).default("startTime"),
  order: z.enum(["asc", "desc"]).default("asc"),
});
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuery>;
