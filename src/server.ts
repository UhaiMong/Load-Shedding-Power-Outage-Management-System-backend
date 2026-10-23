import path from "node:path";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { cache } from "./lib/cache.js";
import { prisma } from "./lib/prisma.js";
import { syncScheduleStates } from "./modules/schedule/schedule.service.js";

const entryName = path.basename(process.argv[1] ?? "");
const isServerProcess =
	process.env.VERCEL !== "1" &&
	(entryName === "server.ts" || entryName === "server.js");

if (isServerProcess) {
	const server = app.listen(env.PORT, () => {
		console.log(
			`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
		);
	});

	// Moves planned outages between SCHEDULED and ACTIVE on a long-running process.
	const SYNC_MS = 60_000;
	const timer = setInterval(() => {
		syncScheduleStates().catch((err) =>
			console.error(
				"[schedule-sync]",
				err instanceof Error ? err.message : err,
			),
		);
	}, SYNC_MS);
	timer.unref();

	const shutdown = (signal: string) => {
		console.log(`${signal} received, shutting down...`);
		clearInterval(timer);
		server.close(async () => {
			await Promise.allSettled([prisma.$disconnect(), cache.close()]);
			process.exit(0);
		});
		setTimeout(() => process.exit(1), 10_000).unref();
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	process.on("unhandledRejection", (reason) => {
		console.error("[unhandledRejection]", reason);
	});
	process.on("uncaughtException", (err) => {
		console.error("[uncaughtException]", err);
		shutdown("uncaughtException");
	});
}

export { app };
export default app;
