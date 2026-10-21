import { z } from "zod";
import { paginationSchema } from "../../utils/pagination";

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
      .nullable(),
    address: z.string().trim().max(255).nullable(),
    meterNumber: z.string().trim().min(3).max(30).nullable(),
    areaId: z.string().min(1).nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "At least one field is required");
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const availabilitySchema = z.object({ isAvailable: z.boolean() });

export const listTechniciansQuery = paginationSchema.extend({
  zoneId: z.string().min(1).optional(),
  available: z.stringbool().optional(),
  q: z.string().trim().min(1).optional(),
});
export type ListTechniciansQuery = z.infer<typeof listTechniciansQuery>;
