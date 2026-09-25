import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import {
  TOOL_FUNCTIONS,
  TOOL_OPTIONAL_FUNCTIONS,
  TOOL_CATALOG_VERSION,
} from "../tool-policy.js";
import { READ_OPERATIONS } from "./safe-api.js";
import { packet } from "./result.js";
import {
  MOODLE_DECLARATIONS,
  SOURCE_REVISION,
} from "../generated/moodle-api-declarations.js";

export const coverageInput = z
  .object({
    query: z.string().max(100).optional(),
    offset: z.number().int().min(0).max(100000).optional(),
    limit: z.number().int().min(1).max(250).optional(),
    includeInputSchemas: z.boolean().optional(),
  })
  .strict();
export function apiCoverage(
  client: MoodleClient,
  raw: z.infer<typeof coverageInput> = {},
) {
  const options = coverageInput.parse(raw),
    names = [...client.supportedFunctions].sort();
  const highLevel = new Set<string>(["core_webservice_get_site_info"]);
  for (const [tool, required] of Object.entries(TOOL_FUNCTIONS)) {
    if (["moodle_read_api", "moodle_get_api_coverage"].includes(tool)) continue;
    for (const name of [...required, ...(TOOL_OPTIONAL_FUNCTIONS[tool] ?? [])])
      highLevel.add(name);
  }
  const all = names.map((name) => ({
    name,
    declaredType: MOODLE_DECLARATIONS[name]?.type ?? "unknown",
    declarationSource: MOODLE_DECLARATIONS[name]?.source ?? null,
    route: highLevel.has(name)
      ? "high_level"
      : Object.hasOwn(READ_OPERATIONS, name)
        ? "read_adapter"
        : "not_exposed",
    permissionVerified: false,
    liveTested: false,
  }));
  const supported = all.filter((r) => r.route !== "not_exposed").length,
    reads = all.filter((r) => r.declaredType === "read"),
    writes = all.filter((r) => r.declaredType === "write");
  const filtered = all.filter(
      (r) =>
        !options.query ||
        r.name.toLowerCase().includes(options.query.toLowerCase()),
    ),
    offset = options.offset ?? 0,
    limit = options.limit ?? 100;
  const operations = Object.entries(READ_OPERATIONS)
    .filter(
      ([name]) =>
        names.includes(name) &&
        (!options.query || name.includes(options.query)),
    )
    .map(([name, spec]) => ({
      functionName: name,
      purpose: spec.purpose,
      scope: spec.scope,
      ...(options.includeInputSchemas
        ? { parameters: z.toJSONSchema(spec.input, { io: "input" }) }
        : {}),
    }));
  const data = {
    catalogVersion: TOOL_CATALOG_VERSION,
    sourceRevision: SOURCE_REVISION,
    advertisedApiCount: names.length,
    inventoryCoveragePercent: names.length ? 100 : null,
    functionRoutes: supported,
    functionRoutePercent: names.length
      ? Math.round((supported / names.length) * 10000) / 100
      : null,
    declaredReadCount: reads.length,
    declaredWriteCount: writes.length,
    unknownDeclarationCount: all.length - reads.length - writes.length,
    unexposedReadCount: reads.filter((r) => r.route === "not_exposed").length,
    unexposedWriteCount: writes.filter((r) => r.route === "not_exposed").length,
    unexposedCount: all.filter((r) => r.route === "not_exposed").length,
    entries: filtered.slice(offset, offset + limit),
    readOperations: operations,
    definitions: {
      inventory:
        "Function names reported by this token. 100% inventory is not 100% functionality.",
      functionRoutes:
        "At least one implemented invocation route, not every parameter/field or a complete end-user workflow.",
      declaredType:
        "Upstream declaration only; NOT a safety allowlist. Some get/view/mobile APIs can change state.",
      permission:
        "Only Moodle can verify the role and context on an actual call.",
      liveTests:
        "Not inferred from registration or this report. Consult the separately recorded Composio validation report.",
    },
  };
  return packet(
    data,
    `Moodle API inventory: ${names.length}; functions with an implemented route: ${supported}. No API was invoked merely to calculate coverage.`,
    {},
    [],
    {
      mode: "local",
      offset,
      limit,
      total: filtered.length,
      nextOffset: offset + limit < filtered.length ? offset + limit : null,
    },
  );
}
