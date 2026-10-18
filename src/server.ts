import { app } from "./app";
import { env } from "./config/env";

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}. Shutting down server...`);
  server.close(() => {
    console.log("Server closed successfully.");
    process.exit(0);
  });
};

const server = app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
});

server.on("error", (error: Error & { code?: string }) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { server };
export default server;
