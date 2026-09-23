import { getHttpConfig } from "./auth/config.js";
import { getConfig } from "./config.js";
import { createApp } from "./app.js";

try {
  const config = getHttpConfig();
  getConfig(); // Fail closed on incomplete Moodle configuration; do not contact Moodle until authorized.
  const runtime = createApp(config);
  const http = runtime.app.listen(config.port, "0.0.0.0", () =>
    console.log(
      `Moodle MCP listening on port ${config.port}; public endpoint ${config.publicUrl}/mcp`,
    ),
  );
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    http.close(() => {
      runtime.close();
      clearTimeout(timeout);
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Startup failed");
  process.exit(1);
}
