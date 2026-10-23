import { z } from "zod";
import { paginationSchema } from "../../utils/pagination";

export const idParamSchema = z.object({ id: z.string().min(1) });

export const listNotificationsQuery = paginationSchema.extend({
  unreadOnly: z.stringbool().default(false),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;
