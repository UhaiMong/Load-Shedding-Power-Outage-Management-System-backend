import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env, isProd } from "../config/env";
import { AppError } from "../utils/ApiError";
import { redis } from "./cache";
import { sendMail } from "./mailer";

export type OtpPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_PASSWORD";

const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

type Kind = "code" | "attempts" | "cooldown" | "sends";
const key = (kind: Kind, purpose: OtpPurpose, email: string) =>
  `otp:${kind}:${purpose}:${email.toLowerCase()}`;

/** OTPs are stored as an HMAC, never in clear text. */
const hashOtp = (purpose: OtpPurpose, email: string, code: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${purpose}:${email.toLowerCase()}:${code}`)
    .digest("hex");

const client = () => {
  if (!redis)
    throw new AppError(
      503,
      "OTP service unavailable: Redis is not configured (set REDIS_URL)",
    );
  return redis;
};

const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error(
      "[otp] redis error:",
      err instanceof Error ? err.message : err,
    );
    throw new AppError(
      503,
      "OTP service temporarily unavailable. Please try again",
    );
  }
};

const template = (purpose: OtpPurpose, code: string, name?: string) => {
  const hello = name ? `Hello ${name},` : "Hello,";
  const minutes = OTP_TTL_SECONDS / 60;
  const footer = `This code expires in ${minutes} minutes. Never share it with anyone. If you did not request it, ignore this email.`;
  switch (purpose) {
    case "VERIFY_EMAIL":
      return {
        subject: "Verify your email address",
        text: `${hello}\n\nYour email verification code is ${code}.\n\n${footer}`,
      };
    case "RESET_PASSWORD":
      return {
        subject: "Password reset code",
        text: `${hello}\n\nYour password reset code is ${code}.\n\n${footer}`,
      };
    case "CHANGE_PASSWORD":
      return {
        subject: "Confirm your password change",
        text: `${hello}\n\nYour password change code is ${code}.\n\n${footer}`,
      };
  }
};

export const consumeSendQuota = (purpose: OtpPurpose, email: string) =>
  guard(async () => {
    const r = client();
    const cooldownKey = key("cooldown", purpose, email);
    const acquired = await r.set(
      cooldownKey,
      "1",
      "EX",
      RESEND_COOLDOWN_SECONDS,
      "NX",
    );
    if (acquired !== "OK") {
      const wait = Math.max(await r.ttl(cooldownKey), 1);
      throw new AppError(
        429,
        `Please wait ${wait}s before requesting another OTP`,
        [{ retryAfterSeconds: wait }],
      );
    }
    const sendsKey = key("sends", purpose, email);
    const sends = await r.incr(sendsKey);
    if (sends === 1) await r.expire(sendsKey, 3600);
    if (sends > MAX_SENDS_PER_HOUR)
      throw new AppError(
        429,
        "Too many OTP requests. Please try again in an hour",
      );
  });

/** Generates an OTP, stores its hash in Redis (10 min TTL) and emails it. */
export const issue = async (
  purpose: OtpPurpose,
  email: string,
  name?: string,
) => {
  await consumeSendQuota(purpose, email);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await guard(async () => {
    const r = client();
    await r.set(
      key("code", purpose, email),
      hashOtp(purpose, email, code),
      "EX",
      OTP_TTL_SECONDS,
    );
    await r.del(key("attempts", purpose, email));
  });

  const { subject, text } = template(purpose, code, name);
  const sent = await sendMail(email, subject, text);
  if (!sent) {
    if (isProd) {
      await guard(() =>
        client().del(
          key("code", purpose, email),
          key("cooldown", purpose, email),
        ),
      );
      throw new AppError(502, "Could not send the OTP email. Please try again");
    }
    // Development convenience when SMTP is not configured.
    console.log(`[otp:dev] ${purpose} for ${email}: ${code}`);
  }
  return { expiresInSeconds: OTP_TTL_SECONDS };
};

/** Verifies and consumes an OTP. */
export const verify = (purpose: OtpPurpose, email: string, code: string) =>
  guard(async () => {
    const r = client();
    const codeKey = key("code", purpose, email);
    const attemptsKey = key("attempts", purpose, email);

    const stored = await r.get(codeKey);
    if (!stored) throw new AppError(400, "OTP expired or was not requested");

    const attempts = await r.incr(attemptsKey);
    if (attempts === 1) await r.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await r.del(codeKey, attemptsKey);
      throw new AppError(
        429,
        "Too many wrong attempts. Please request a new OTP",
      );
    }

    const a = Buffer.from(stored, "hex");
    const b = Buffer.from(hashOtp(purpose, email, code), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppError(
        400,
        `Invalid OTP. ${MAX_VERIFY_ATTEMPTS - attempts} attempt(s) left`,
      );
    }

    // DEL returns 1 only for the single request that actually consumed the code.
    const consumed = await r.del(codeKey);
    await r.del(attemptsKey);
    if (consumed !== 1) throw new AppError(400, "OTP was already used");
  });

export const otpExpiresInSeconds = OTP_TTL_SECONDS;
