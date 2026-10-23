import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { auth } from "./lib/auth.js";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import routes from "./routes.js";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "OK",
    data: {
      service: `Server is running on port ${env.PORT}`,
      uptime: process.uptime(),
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "OK",
    data: {
      service: "load-shedding-api",
      uptime: process.uptime(),
    },
  });
});

app.use(apiLimiter);

// Better auth native endpoint
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
