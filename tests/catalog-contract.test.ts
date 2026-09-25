import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools } from "../src/register-tools.js";
import { TOOL_FUNCTIONS, TOOL_CATALOG_VERSION } from "../src/tool-policy.js";
import { studentOutputs } from "../src/student/output.js";

describe("backend catalog contract", () => {
  it("keeps manifest, runtime tool names and package/catalog versions in sync", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
    );
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const registerTool = vi.fn();
    registerAllTools({ registerTool } as unknown as McpServer, async () => {
      throw new Error("discovery never calls upstream");
    });
    const actual = registerTool.mock.calls.map((c) => c[0]).sort();
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual).toEqual(Object.keys(TOOL_FUNCTIONS).sort());
    expect(manifest.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      actual,
    );
    expect(manifest.version).toBe(pkg.version);
    expect(TOOL_CATALOG_VERSION).toBe(pkg.version);
  });
  it("declares per-tool structured outputs for the migrated student reads", () => {
    const registerTool = vi.fn();
    registerAllTools({ registerTool } as unknown as McpServer, async () => {
      throw new Error("no upstream");
    });
    for (const name of Object.keys(studentOutputs)) {
      const [, options] = registerTool.mock.calls.find((c) => c[0] === name)!;
      expect(options.outputSchema).toBe(
        studentOutputs[name as keyof typeof studentOutputs],
      );
      expect(options.outputSchema.shape.data.shape).toBeDefined();
    }
  });
});
