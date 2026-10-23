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

/** Best-effort email. */
export const sendMail = async (
  to: string | string[],
  subject: string,
  text: string,
) => {
  if (!transporter) return;
  try {
    await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
  } catch (err) {
    console.error("[mail]", err instanceof Error ? err.message : err);
  }
};
