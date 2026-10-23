import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { Prisma } from "../../../generated/prisma/client.js";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth.js";
import * as otp from "../../lib/otp.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/ApiError.js";
import { audit } from "../../utils/audit.js";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./auth.validator.js";

const publicUser = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  emailVerified: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const findUser = (email: string) =>
  prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      emailVerified: true,
    },
  });

/** Writes a new password hash to the credential account. */
const writePassword = async (userId: string, password: string) => {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const { count } = await prisma.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: hash },
  });
  if (count === 0) {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
      },
    });
  }
};

// signup + email verification
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
  const { user: created } = await auth.api.signUpEmail({
    body: { name: input.name, email: input.email, password: input.password },
  });

  await prisma.$transaction(async (tx) => {
    await tx.profile.create({
      data: {
        userId: created.id as string,
        phone: input.phone as string | null,
        address: input.address as string | null,
        meterNumber: input.meterNumber as string | null,
        areaId: input.areaId as string | null,
      },
    });
    await audit(
      tx,
      { id: created.id as string, ...(ip !== undefined ? { ip } : {}) },
      {
        action: "USER_REGISTERED",
        entity: "User",
        entityId: created.id as string,
      },
    );
  });

  let otpSent = true;
  let otpMessage: string | undefined;
  try {
    await otp.issue("VERIFY_EMAIL", input.email, input.name);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    otpSent = false;
    otpMessage = err.message;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: created.id },
    select: publicUser,
  });
  return {
    user,
    emailVerificationRequired: true,
    otpSent,
    ...(otpSent
      ? { otpExpiresInSeconds: otp.otpExpiresInSeconds }
      : { otpMessage }),
  };
};

export const verifyEmail = async (input: VerifyEmailInput, ip?: string) => {
  const user = await findUser(input.email);
  if (!user?.isActive) throw new AppError(400, "Invalid or expired OTP");
  if (user.emailVerified)
    throw new AppError(409, "Email is already verified. Please log in");

  await otp.verify("VERIFY_EMAIL", input.email, input.otp);
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await audit(
    prisma,
    { id: user.id as string, ...(ip !== undefined ? { ip } : {}) },
    { action: "EMAIL_VERIFIED", entity: "User", entityId: user.id as string },
  );

  // Email proven: sign the user in right away.
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const verified = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: publicUser,
  });
  return { user: verified, token: session.token, expiresAt: session.expiresAt };
};

export const resendVerificationOtp = async (email: string) => {
  const user = await findUser(email);
  if (user?.isActive && !user.emailVerified)
    await otp.issue("VERIFY_EMAIL", email, user.name);
  else await otp.consumeSendQuota("VERIFY_EMAIL", email); // same limits & response for unknown/verified emails
  return {
    message:
      "If the account exists and is not verified, a new OTP has been sent",
    expiresInSeconds: otp.otpExpiresInSeconds,
  };
};

// login / session
export const login = async (input: LoginInput, ip?: string) => {
  const account = await findUser(input.email);
  const deleted = !account
    ? await prisma.user.findFirst({
        where: { email: input.email, deletedAt: { not: null } },
        select: { id: true },
      })
    : null;
  if (deleted || (account && !account.isActive))
    throw new AppError(403, "This account is deactivated");
  if (account && !account.emailVerified) {
    throw new AppError(
      403,
      "Email is not verified. Verify it with the OTP sent to your email",
      [{ code: "EMAIL_NOT_VERIFIED" }],
    );
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
    prisma,
    { id: user.id as string, ...(ip !== undefined ? { ip } : {}) },
    { action: "USER_LOGIN", entity: "User", entityId: user.id as string },
  );
  return { user, token: headers.get("set-auth-token") ?? response.token };
};

/** Session rotation: issues a fresh session token and revokes the presented one. */
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
    prisma,
    { id: current.user.id as string, ...(ip !== undefined ? { ip } : {}) },
    {
      action: "TOKEN_REFRESHED",
      entity: "User",
      entityId: current.user.id as string,
    },
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
    prisma,
    { id: userId as string, ...(ip !== undefined ? { ip } : {}) },
    { action: "USER_LOGOUT", entity: "User", entityId: userId as string },
  );
  return { loggedOut: true };
};

//  forgot / reset password
export const forgotPassword = async (email: string) => {
  const user = await findUser(email);
  if (user?.isActive) await otp.issue("RESET_PASSWORD", email, user.name);
  else await otp.consumeSendQuota("RESET_PASSWORD", email); // never reveal whether the email exists
  return {
    message:
      "If an account exists for this email, a password reset OTP has been sent",
    expiresInSeconds: otp.otpExpiresInSeconds,
  };
};

export const resetPassword = async (input: ResetPasswordInput, ip?: string) => {
  const user = await findUser(input.email);
  if (!user?.isActive) throw new AppError(400, "Invalid or expired OTP");

  await otp.verify("RESET_PASSWORD", input.email, input.otp);
  await writePassword(user.id, input.newPassword);
  // Receiving the OTP also proves ownership of the email.
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await audit(
    prisma,
    { id: user.id as string, ...(ip !== undefined ? { ip } : {}) },
    { action: "PASSWORD_RESET", entity: "User", entityId: user.id as string },
  );
  return { passwordReset: true };
};

// change password (logged in)
export const sendChangePasswordOtp = async (user: {
  id: string;
  name: string;
  email: string;
}) => {
  const sent = await otp.issue("CHANGE_PASSWORD", user.email, user.name);
  return {
    message: "An OTP has been sent to your email",
    expiresInSeconds: sent.expiresInSeconds,
  };
};

export const changePassword = async (
  user: { id: string; email: string },
  reqHeaders: IncomingHttpHeaders,
  input: ChangePasswordInput,
  ip?: string,
) => {
  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { password: true },
  });
  if (!credential?.password) {
    throw new AppError(
      400,
      "This account has no password yet (social login). Use forgot-password to set one",
    );
  }
  const ctx = await auth.$context;
  const matches = await ctx.password.verify({
    hash: credential.password,
    password: input.currentPassword,
  });
  if (!matches) throw new AppError(400, "Current password is incorrect");

  await otp.verify("CHANGE_PASSWORD", user.email, input.otp);
  await writePassword(user.id, input.newPassword);

  // Keep this device signed in, sign out every other session.
  const current = await auth.api.getSession({
    headers: fromNodeHeaders(reqHeaders),
  });
  await prisma.session.deleteMany({
    where: {
      userId: user.id,
      ...(current ? { token: { not: current.session.token } } : {}),
    },
  });
  await audit(
    prisma,
    { id: user.id as string, ...(ip !== undefined ? { ip } : {}) },
    { action: "PASSWORD_CHANGED", entity: "User", entityId: user.id as string },
  );
  return { passwordChanged: true };
};
