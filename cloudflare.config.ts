import { bindings, defineConfig, exports } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars.example, .env.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */


export default defineConfig({
	worker: {
		name: "moodle",
		compatibilityDate: "2026-09-23",
		compatibilityFlags: [
			"nodejs_compat",
			"global_fetch_strictly_public",
		],
		entrypoint: "src/worker.ts",
		workersDev: true,
		observability: {
			enabled: true,
			headSamplingRate: 1,
			logs: {
				enabled: true,
				invocationLogs: true,
				headSamplingRate: 1,
				persist: true,
			},
			traces: {
				enabled: true,
				headSamplingRate: 1,
				persist: true,
			},
		},
		exports: {
			MoodleMcp: exports.durableObject({ storage: "sqlite" }),
		},
		env: {
			PUBLIC_URL: bindings.text("https://moodle.yusoofsh.id"),
			MOODLE_MCP_MAX_FILE_MB: bindings.text("2"),
			MOODLE_MCP: bindings.durableObject({
				worker: "moodle",
				exportName: "MoodleMcp",
			}),
		},
	},
});
