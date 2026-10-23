import type { Db } from "./audit.js";

// Transaction-scoped Postgres advisory lock
export const advisoryLock = (tx: Db, key: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
