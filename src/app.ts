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

const rootPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Load Shedding API</title>
</head>
<body>
  <main>
    <h1>Load Shedding &amp; Power Outage Management System</h1>
    <p>The API is running.</p>
    <ul>
      <li><a href="/health">Health check</a></li>
      <li><code>/api/v1</code> application routes</li>
      <li><code>/api/auth</code> authentication</li>
    </ul>
  </main>
</body>
</html>`;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

app.get("/", (_req, res) => {
	res.type("html").send(rootPage);
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
