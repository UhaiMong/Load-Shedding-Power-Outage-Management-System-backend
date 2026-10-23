import { Role } from "@generated/prisma/enums";
import { z } from "zod";
import { orderSchema, paginationSchema } from "../../utils/pagination";

export const idParamSchema = z.object({ id: z.string().min(1) });

export const listUsersQuery = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  role: z.enum(Role).optional(),
  isActive: z.stringbool().optional(),
  includeDeleted: z.stringbool().default(false),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  order: orderSchema,
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;

export const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(Role).exclude(["CUSTOMER"]),
  zoneId: z.string().min(1).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/)
    .optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateRoleSchema = z.object({
  role: z.enum(Role),
  zoneId: z.string().min(1).nullable().optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const updateStatusSchema = z.object({ isActive: z.boolean() });

export const auditLogsQuery = paginationSchema.extend({
  entity: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  actorId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditLogsQuery = z.infer<typeof auditLogsQuery>;
