import { Redis } from "ioredis";
import { env } from "../config/env";

const client = env.REDIS_URL
	? new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: 1,
			enableOfflineQueue: false,
		})
	: null;

client?.on("error", (err) => console.error("[redis]", err.message));

export const cache = {
	async get<T>(key: string): Promise<T | null> {
		if (!client) return null;
		try {
			const raw = await client.get(key);
			return raw ? (JSON.parse(raw) as T) : null;
		} catch {
			return null;
		}
	},

	async set(key: string, value: unknown, ttlSeconds = 60) {
		if (!client) return;
		try {
			await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
		} catch {
			/* ignore */
		}
	},

	async invalidate(prefix: string) {
		if (!client) return;
		try {
			const stream = client.scanStream({ match: `${prefix}*`, count: 100 });
			for await (const keys of stream) {
				if ((keys as string[]).length) await client.del(...(keys as string[]));
			}
		} catch {
			/* ignore */
		}
	},

	async wrap<T>(
		key: string,
		ttlSeconds: number,
		loader: () => Promise<T>,
	): Promise<T> {
		const hit = await this.get<T>(key);
		if (hit !== null) return hit;
		const fresh = await loader();
		await this.set(key, fresh, ttlSeconds);
		return fresh;
	},

	async close() {
		await client?.quit().catch(() => undefined);
	},
};
