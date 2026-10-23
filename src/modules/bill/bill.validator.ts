import { BillStatus } from "../../../generated/prisma/enums.js";
import { z } from "zod";
import { orderSchema, paginationSchema } from "../../utils/pagination.js";

export const idParamSchema = z.object({ id: z.string().min(1) });

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use format YYYY-MM");

export const createBillSchema = z.object({
  customerId: z.string().min(1),
  billingMonth: month,
  units: z.number().min(0).max(1_000_000),
  dueDate: z.coerce.date(),
});
export type CreateBillInput = z.infer<typeof createBillSchema>;

export const listBillsQuery = paginationSchema.extend({
  status: z.enum(BillStatus).optional(),
  customerId: z.string().min(1).optional(),
  month: month.optional(),
  sortBy: z.enum(["createdAt", "dueDate", "amount"]).default("createdAt"),
  order: orderSchema,
});
export type ListBillsQuery = z.infer<typeof listBillsQuery>;
