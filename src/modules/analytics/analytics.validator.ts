import { z } from "zod";

export const analyticsQuery = z
  .object({
    from: z.coerce
      .date()
      .default(() => new Date(Date.now() - 30 * 24 * 3_600_000)),
    to: z.coerce.date().default(() => new Date()),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine((q) => q.to >= q.from, {
    message: "to must not be before from",
    path: ["to"],
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;
