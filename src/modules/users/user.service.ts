import type { Prisma } from "../../../generated/prisma/client";
import { Role } from "../../../generated/prisma/enums";

import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/ApiError";
import { type Actor, audit } from "../../utils/audit";

import { buildMeta, getSkipTake } from "../../utils/pagination";
import type { ListTechniciansQuery, UpdateMeInput } from "./user.validator";

export const meSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  isActive: true,
  createdAt: true,
  profile: {
    select: {
      phone: true,
      address: true,
      meterNumber: true,
      isAvailable: true,
      isBusy: true,
      area: {
        select: {
          id: true,
          name: true,
          code: true,
          feeder: { select: { id: true, name: true, code: true } },
        },
      },
      zone: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.UserSelect;

export const getMe = async (userId: string) =>
  prisma.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null },
    select: meSelect,
  });

export const updateMe = async (actor: Actor, input: UpdateMeInput) => {
  const { name, ...profileFields } = input;
  if (profileFields.areaId) {
    const area = await prisma.area.findFirst({
      where: { id: profileFields.areaId, deletedAt: null },
      select: { id: true },
    });
    if (!area) throw new AppError(404, "Area not found");
  }
  await prisma.$transaction(async (tx) => {
    if (name) await tx.user.update({ where: { id: actor.id }, data: { name } });
    if (Object.keys(profileFields).length > 0) {
      await tx.profile.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, ...profileFields },
        update: profileFields,
      });
    }
    await audit(tx, actor, {
      action: "PROFILE_UPDATED",
      entity: "User",
      entityId: actor.id,
      metadata: { fields: Object.keys(input) },
    });
  });
  return getMe(actor.id);
};

export const uploadAvatar = async (
  actor: Actor,
  file: Express.Multer.File | undefined,
) => {
  if (!file)
    throw new AppError(400, "Image file is required (field name: image)");
  const image = await uploadImage(file.buffer, "avatars");
  await prisma.user.update({ where: { id: actor.id }, data: { image } });
  await audit(prisma, actor, {
    action: "AVATAR_UPDATED",
    entity: "User",
    entityId: actor.id,
  });
  return { image };
};

export const setAvailability = async (actor: Actor, isAvailable: boolean) => {
  const profile = await prisma.profile.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, isAvailable },
    update: { isAvailable },
    select: { isAvailable: true, isBusy: true },
  });
  await audit(prisma, actor, {
    action: "AVAILABILITY_CHANGED",
    entity: "User",
    entityId: actor.id,
    metadata: { isAvailable },
  });
  return profile;
};

/** Soft-deletes the caller's own account and revokes every session. */
export const deleteMe = async (actor: Actor) => {
  if (actor.role === Role.ADMIN)
    throw new AppError(403, "Admin accounts must be removed by another admin");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await tx.session.deleteMany({ where: { userId: actor.id } });
    await audit(tx, actor, {
      action: "ACCOUNT_DELETED",
      entity: "User",
      entityId: actor.id,
    });
  });
  return { deleted: true };
};

export const listTechnicians = async (query: ListTechniciansQuery) => {
  const where: Prisma.UserWhereInput = {
    role: Role.TECHNICIAN,
    isActive: true,
    deletedAt: null,
    ...(query.q
      ? {
          OR: [
            { name: containsInsensitive(query.q) },
            { email: containsInsensitive(query.q) },
          ],
        }
      : {}),
    profile: {
      is: {
        ...(query.zoneId ? { zoneId: query.zoneId } : {}),
        ...(query.available ? { isAvailable: true, isBusy: false } : {}),
      },
    },
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        profile: {
          select: {
            phone: true,
            isAvailable: true,
            isBusy: true,
            zone: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
      ...getSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);
  return { items, meta: buildMeta(query.page, query.limit, total) };
};
