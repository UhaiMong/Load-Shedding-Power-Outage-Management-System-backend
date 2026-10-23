import type { IncomingHttpHeaders } from "node:http";
import type { Prisma } from "@generated/prisma/client";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/ApiError";
import { audit } from "../../utils/audit";
import type { LoginInput, RegisterInput } from "./auth.validator";

const publicUser = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const register = async (input: RegisterInput, ip?: string) => {
  if (input.areaId) {
    const area = await prisma.area.findFirst({
      where: { id: input.areaId, deletedAt: null },
      select: { id: true },
    });
    if (!area) throw new AppError(404, "Area not found");
  }
  if (input.meterNumber) {
    const taken = await prisma.profile.findUnique({
      where: { meterNumber: input.meterNumber },
      select: { id: true },
    });
    if (taken) throw new AppError(409, "Meter number is already registered");
  }
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing)
    throw new AppError(409, "An account with this email already exists");

  // Self-registration always creates a CUSTOMER (DB default); staff accounts are created by admins.
  const { headers, response } = await auth.api.signUpEmail({
    body: { name: input.name, email: input.email, password: input.password },
    returnHeaders: true,
  });
  const userId = response.user.id;

  await prisma.$transaction(async (tx) => {
    await tx.profile.create({
      data: {
        userId,
        phone: input.phone ?? null,
        address: input.address ?? null,
        meterNumber: input.meterNumber ?? null,
        areaId: input.areaId ?? null,
      },
    });
    await audit(
      tx as Parameters<typeof audit>[0],
      { id: userId, ...(ip !== undefined ? { ip } : {}) },
      { action: "USER_REGISTERED", entity: "User", entityId: userId },
    );
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: publicUser,
  });
  return { user, token: headers.get("set-auth-token") ?? response.token };
};

export const login = async (input: LoginInput, ip?: string) => {
  const account = await prisma.user.findUnique({
    where: { email: input.email },
    select: { isActive: true, deletedAt: true },
  });
  if (account && (account.deletedAt || !account.isActive)) {
    throw new AppError(403, "This account is deactivated");
  }

  const { headers, response } = await auth.api.signInEmail({
    body: { email: input.email, password: input.password },
    returnHeaders: true,
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: response.user.id },
    select: publicUser,
  });
  await audit(
    prisma as Parameters<typeof audit>[0],
    { id: user.id, ...(ip !== undefined ? { ip } : {}) },
    { action: "USER_LOGIN", entity: "User", entityId: user.id },
  );
  return { user, token: headers.get("set-auth-token") ?? response.token };
};

// refresh token
export const refreshToken = async (
  reqHeaders: IncomingHttpHeaders,
  ip?: string,
) => {
  const current = await auth.api.getSession({
    headers: fromNodeHeaders(reqHeaders),
    query: { disableCookieCache: true },
  });
  if (!current)
    throw new AppError(
      401,
      "Session is invalid or expired. Please log in again",
    );

  const ctx = await auth.$context;
  const fresh = await ctx.internalAdapter.createSession(current.user.id);
  await ctx.internalAdapter.deleteSession(current.session.token);

  await audit(
    prisma as Parameters<typeof audit>[0],
    { id: current.user.id, ...(ip !== undefined ? { ip } : {}) },
    { action: "TOKEN_REFRESHED", entity: "User", entityId: current.user.id },
  );
  return { token: fresh.token, expiresAt: fresh.expiresAt };
};

export const logout = async (
  reqHeaders: IncomingHttpHeaders,
  userId: string,
  ip?: string,
) => {
  await auth.api.signOut({ headers: fromNodeHeaders(reqHeaders) });
  await audit(
    prisma as Parameters<typeof audit>[0],
    { id: userId, ...(ip !== undefined ? { ip } : {}) },
    { action: "USER_LOGOUT", entity: "User", entityId: userId },
  );
  return { loggedOut: true };
};
