import "dotenv/config";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_URL: z.url().default("http://localhost:5000"),
  APP_TIMEZONE: z.string().default("Asia/Dhaka"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: optional,

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().default("http://localhost:5000"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_FROM: z.string().default("Power Authority <no-reply@example.com>"),

  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,

  BKASH_BASE_URL: z
    .url()
    .default("https://tokenized.sandbox.bka.sh/v1.2.0-beta"),
  BKASH_APP_KEY: optional,
  BKASH_APP_SECRET: optional,
  BKASH_USERNAME: optional,
  BKASH_PASSWORD: optional,
  BKASH_WEBHOOK_SECRET: optional,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
