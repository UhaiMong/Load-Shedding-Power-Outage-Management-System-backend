import type { Request } from "express";
import type { Actor } from "./audit";

/** Validated query */
export const getQuery = <T>(req: Request) => req.query as unknown as T;

/** Authenticated actor + request IP */
export const getActor = (req: Request): Actor => {
  const user = (req as Request & { user?: Pick<Actor, "id" | "role"> }).user;
  if (!user) throw new Error("getActor called on an unauthenticated request");
  return {
    id: user.id,
    role: user.role,
    ...(req.ip === undefined ? {} : { ip: req.ip }),
  };
};

export const param = (req: Request, name: string) => String(req.params[name]);
