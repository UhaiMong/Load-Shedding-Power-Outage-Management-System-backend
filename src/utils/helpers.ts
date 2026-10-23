import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: env.APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

export const generateTicketNo = () => {
  const d = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `OUT-${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Run side effects (emails, notifications) without blocking or failing the request. */
export const fireAndForget = (task: () => Promise<unknown>) => {
  void Promise.resolve()
    .then(task)
    .catch((err) => console.error("[background]", err instanceof Error ? err.message : err));
};

export const containsInsensitive = (q: string) => ({ contains: q, mode: "insensitive" as const });
