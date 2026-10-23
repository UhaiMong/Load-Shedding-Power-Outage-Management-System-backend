import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    })
  : null;

/** Best-effort email: never throws. */
export const sendMail = async (
  to: string | string[],
  subject: string,
  text: string,
): Promise<boolean> => {
  if (!transporter) return false;
  try {
    await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return true;
  } catch (err) {
    console.error("[mail]", err instanceof Error ? err.message : err);
    return false;
  }
};
