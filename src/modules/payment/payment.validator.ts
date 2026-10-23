import { PaymentStatus } from "../../../generated/prisma/enums";
import { z } from "zod";
import { orderSchema, paginationSchema } from "../../utils/pagination";

export const idParamSchema = z.object({ id: z.string().min(1) });

export const initiatePaymentSchema = z.object({ billId: z.string().min(1) });

export const callbackQuerySchema = z.object({
  paymentID: z.string().min(1).optional(),
  status: z.enum(["success", "failure", "cancel"]),
});
export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

export const webhookSchema = z.object({ paymentID: z.string().min(1) });

export const listPaymentsQuery = paginationSchema.extend({
  status: z.enum(PaymentStatus).optional(),
  billId: z.string().min(1).optional(),
  sortBy: z.enum(["createdAt", "amount", "paidAt"]).default("createdAt"),
  order: orderSchema,
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>;
