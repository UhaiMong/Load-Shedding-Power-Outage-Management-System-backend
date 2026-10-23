import { Role } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./ApiError.js";
import type { Actor } from "./audit.js";

// Admin & operators have network-wide access
export const assertZoneAccess = async (actor: Actor, zoneId: string) => {
  if (actor.role === Role.ADMIN || actor.role === Role.OPERATOR) return;
  if (actor.role !== Role.ZONE_MANAGER)
    throw new AppError(403, "Insufficient permissions");
  const zone = await prisma.zone.findFirst({
    where: { id: zoneId, deletedAt: null },
    select: { managerId: true },
  });
  if (!zone) throw new AppError(404, "Zone not found");
  if (zone.managerId !== actor.id)
    throw new AppError(403, "You do not manage this zone");
};
