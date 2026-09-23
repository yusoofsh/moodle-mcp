import { createAppWithStore } from "./app-core.js";
import { AuthStore } from "./auth/store.js";
import type { HttpConfig } from "./auth/config.js";

export function createApp(
  config: HttpConfig,
  dependencies: Parameters<typeof createAppWithStore>[2] = {},
) {
  return createAppWithStore(
    config,
    new AuthStore(config.databasePath, config.authSecret),
    dependencies,
  );
}
