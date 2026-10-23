import type { Role } from "../../generated/prisma/enums.js";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, RequestHandler } from "express";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/ApiError.js";
import { catchAsync } from "../utils/catchAsync.js";

type AuthenticatedRequest = Request & {
  user?: { id: string; name: string; email: string; role: Role };
};

/** Resolves the Bearer token */
export const authenticate: RequestHandler = catchAsync(
  async (req, _res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session)
      throw new AppError(
        401,
        "Authentication required. Provide a valid Bearer token",
      );

    const user = await prisma.user.findFirst({
      where: { id: session.user.id, deletedAt: null },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!user) throw new AppError(401, "Account no longer exists");
    if (!user.isActive) throw new AppError(403, "Account is deactivated");

    (req as AuthenticatedRequest).user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  },
);

/** Higher-order middleware */

export const authorize =
  (...roles: readonly Role[]): RequestHandler =>
  (req, _res, next) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return next(new AppError(401, "Authentication required"));
    if (!roles.includes(user.role)) {
      return next(
        new AppError(403, "You do not have permission to perform this action"),
      );
    }
    next();
  };
