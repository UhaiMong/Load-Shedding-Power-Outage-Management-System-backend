import { Role } from "@generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { AppError } from "./ApiError";
import type { Actor } from "./audit";

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
