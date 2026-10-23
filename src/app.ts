import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { auth } from "./lib/auth";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimiter";
import routes from "./routes";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(apiLimiter);

// Better auth native endpoint
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("App is running!");
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "OK",
    data: { uptime: process.uptime() },
  });
});
app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(globalErrorHandler);
