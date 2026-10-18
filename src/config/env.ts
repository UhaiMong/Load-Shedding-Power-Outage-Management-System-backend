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
  // Optional
  REDIS_URL: optional,
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
