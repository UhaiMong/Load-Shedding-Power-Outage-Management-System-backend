import { OutageStatus, PriorityLevel } from "../../../generated/prisma/enums";
import { z } from "zod";
import { paginationSchema } from "../../utils/pagination";

export const idParamSchema = z.object({ id: z.string().min(1) });

// Sent as multipart/form-data

export const reportOutageSchema = z.object({
  description: z.string().trim().min(5).max(1000),
  areaId: z.string().min(1).optional(),
});
export type ReportOutageInput = z.infer<typeof reportOutageSchema>;

export const verifyOutageSchema = z.object({
  severity: z.enum(PriorityLevel).optional(),
  cause: z.string().trim().max(300).optional(),
  estimatedRestorationAt: z.coerce.date().optional(),
});
export type VerifyOutageInput = z.infer<typeof verifyOutageSchema>;

export const rejectOutageSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const assignSchema = z.object({ technicianId: z.string().min(1) });

export const updateStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "RESTORED"]),
  notes: z.string().trim().max(1000).optional(),
  cause: z.string().trim().max(300).optional(),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const listOutagesQuery = paginationSchema.extend({
  status: z.enum(OutageStatus).optional(),
  severity: z.enum(PriorityLevel).optional(),
  areaId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  technicianId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
  sortBy: z
    .enum(["startedAt", "reportCount", "severity", "status"])
    .default("startedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ListOutagesQuery = z.infer<typeof listOutagesQuery>;
