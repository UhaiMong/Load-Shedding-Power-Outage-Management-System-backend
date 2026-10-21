import { app } from "./app";
import { env } from "./config/env";
import { cache } from "./lib/cache";
import { prisma } from "./lib/prisma";
import { syncScheduleStates } from "./modules/schedule/schedule.service";

const server = app.listen(env.PORT, () => {
	console.log(
		`API listening on :http://localhost:${env.PORT} /(${env.NODE_ENV})`,
	);
});

// Moves planned outages SCHEDULED
const SYNC_MS = 60_000;
const timer = setInterval(() => {
	syncScheduleStates().catch((err) =>
		console.error("[schedule-sync]", err instanceof Error ? err.message : err),
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

export { server };
export default server;
