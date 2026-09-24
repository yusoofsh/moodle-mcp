import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Isolate native browser drivers and workerd TLS lifecycles between cases.
// Each case still verifies persisted state across an actual runtime restart.
const runner = fileURLToPath(new URL("./sso-worker-case.mjs", import.meta.url));
let passed = 0;
for (const flow of ["sso", "import"]) {
  for (const browser of ["chromium", "firefox"]) {
    const result = spawnSync(process.execPath, [runner, browser, flow], {
      stdio: "inherit",
      timeout: 120000,
      killSignal: "SIGKILL",
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        `SSO browser case failed: ${browser}/${flow}; status=${result.status}; signal=${result.signal}`,
      );
    }
    passed++;
  }
}
console.log(
  `SSO browser/workerd groups: ${passed} passed; synthetic university responses; real Google and native protocol dispatch are not automated.`,
);
