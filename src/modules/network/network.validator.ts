import { AreaType, FeederStatus, PriorityLevel } from "../../../generated/prisma/enums.js";
import { z } from "zod";
import { orderSchema, paginationSchema } from "../../utils/pagination.js";

export const idParamSchema = z.object({ id: z.string().min(1) });

const name = z.string().trim().min(2).max(100);
const code = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, "Code may contain letters, numbers, - and _")
  .transform((v) => v.toUpperCase());
const id = z.string().min(1);
const q = z.string().trim().min(1).optional();
const nonEmpty = (o: object) => Object.keys(o).length > 0;
const NON_EMPTY_MSG = "At least one field is required";

//  Zone
export const createZoneSchema = z.object({
  name,
  code,
  description: z.string().trim().max(500).optional(),
  managerId: id.optional(),
});
export type CreateZoneInput = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = z
  .object({
    name,
    code,
    description: z.string().trim().max(500).nullable(),
    managerId: id.nullable(),
  })
  .partial()
  .refine(nonEmpty, NON_EMPTY_MSG);
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;

export const listZonesQuery = paginationSchema.extend({
  q,
  sortBy: z.enum(["name", "code", "createdAt"]).default("createdAt"),
  order: orderSchema,
});
export type ListZonesQuery = z.infer<typeof listZonesQuery>;

// Substation
export const createSubstationSchema = z.object({
  zoneId: id,
  name,
  code,
  capacityMw: z.number().positive(),
});
export type CreateSubstationInput = z.infer<typeof createSubstationSchema>;

export const updateSubstationSchema = z
  .object({ name, code, capacityMw: z.number().positive() })
  .partial()
  .refine(nonEmpty, NON_EMPTY_MSG);
export type UpdateSubstationInput = z.infer<typeof updateSubstationSchema>;

export const listSubstationsQuery = paginationSchema.extend({
  q,
  zoneId: id.optional(),
  sortBy: z
    .enum(["name", "code", "capacityMw", "createdAt"])
    .default("createdAt"),
  order: orderSchema,
});
export type ListSubstationsQuery = z.infer<typeof listSubstationsQuery>;

//  Feeder
export const createFeederSchema = z
  .object({
    substationId: id,
    name,
    code,
    capacityMw: z.number().positive(),
    loadMw: z.number().min(0).default(0),
    priority: z.enum(PriorityLevel).default("MEDIUM"),
  })
  .refine((f) => f.loadMw <= f.capacityMw, {
    message: "loadMw cannot exceed capacityMw",
    path: ["loadMw"],
  });
export type CreateFeederInput = z.infer<typeof createFeederSchema>;

export const updateFeederSchema = z
  .object({
    name,
    code,
    capacityMw: z.number().positive(),
    priority: z.enum(PriorityLevel),
    status: z.enum(FeederStatus),
  })
  .partial()
  .refine(nonEmpty, NON_EMPTY_MSG);
export type UpdateFeederInput = z.infer<typeof updateFeederSchema>;

export const updateFeederLoadSchema = z.object({
  loadMw: z.number().min(0),
  status: z.enum(FeederStatus).optional(),
});
export type UpdateFeederLoadInput = z.infer<typeof updateFeederLoadSchema>;

export const listFeedersQuery = paginationSchema.extend({
  q,
  substationId: id.optional(),
  zoneId: id.optional(),
  priority: z.enum(PriorityLevel).optional(),
  status: z.enum(FeederStatus).optional(),
  sortBy: z
    .enum(["name", "code", "loadMw", "priority", "createdAt"])
    .default("createdAt"),
  order: orderSchema,
});
export type ListFeedersQuery = z.infer<typeof listFeedersQuery>;

// ---------- Area ----------
export const createAreaSchema = z.object({
  feederId: id,
  name,
  code,
  type: z.enum(AreaType).default("RESIDENTIAL"),
  customerCount: z.number().int().min(0).default(0),
  address: z.string().trim().max(255).optional(),
});
export type CreateAreaInput = z.infer<typeof createAreaSchema>;

export const updateAreaSchema = z
  .object({
    name,
    code,
    type: z.enum(AreaType),
    customerCount: z.number().int().min(0),
    address: z.string().trim().max(255).nullable(),
  })
  .partial()
  .refine(nonEmpty, NON_EMPTY_MSG);
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;

export const listAreasQuery = paginationSchema.extend({
  q,
  feederId: id.optional(),
  zoneId: id.optional(),
  type: z.enum(AreaType).optional(),
  sortBy: z
    .enum(["name", "code", "customerCount", "createdAt"])
    .default("createdAt"),
  order: orderSchema,
});
export type ListAreasQuery = z.infer<typeof listAreasQuery>;
