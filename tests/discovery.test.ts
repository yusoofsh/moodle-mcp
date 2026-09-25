import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { registerAllTools } from "../src/register-tools.js";
import { registerResources } from "../src/resources/index.js";
import { registerPrompts } from "../src/prompts/index.js";
import { TOOL_FUNCTIONS } from "../src/tool-policy.js";
import { MoodleClient } from "../src/moodle-client.js";

const instances: { server: McpServer; client: Client }[] = [];
afterEach(async () => {
  for (const x of instances.splice(0)) {
    await x.client.close();
    await x.server.close();
  }
  vi.unstubAllGlobals();
});
async function fixture(source: () => Promise<MoodleClient>) {
  const server = new McpServer({ name: "moodle-test", version: "1" });
  registerAllTools(server, source);
  registerResources(server, source);
  registerPrompts(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "discovery-test", version: "1" });
  instances.push({ server, client });
  await server.connect(st);
  await client.connect(ct);
  return client;
}
async function upstream(functions: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () =>
      Response.json({
        userid: 42,
        sitename: "Fixture",
        functions: functions.map((name) => ({ name, version: "1" })),
      }),
    ),
  );
  return MoodleClient.create({
    baseUrl: "https://moodle.example",
    token: "fixture-secret",
    maxFileBytes: 1024,
  });
}
describe("MCP discovery is independent from Moodle availability", () => {
  it("initializes and discovers all 18 tools without invoking the upstream factory", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new Error("sensitive upstream body token=fixture-secret"),
      );
    const client = await fixture(create);
    const result = await client.listTools();
    expect(result.tools.map((t) => t.name).sort()).toEqual(
      Object.keys(TOOL_FUNCTIONS).sort(),
    );
    expect(create).not.toHaveBeenCalled();
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool._meta?.securitySchemes).toEqual([
        { type: "oauth2", scopes: ["moodle:read"] },
      ]);
      expect(JSON.parse(JSON.stringify(tool))).not.toHaveProperty("execution");
    }
    expect((await client.listPrompts()).prompts.length).toBeGreaterThan(0);
    expect(
      (await client.listResourceTemplates()).resourceTemplates.length,
    ).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });
  it("reports an upstream failure as a tool error, not a broken discovery handshake", async () => {
    const client = await fixture(
      vi.fn().mockRejectedValue(new Error("token=fixture-secret")),
    );
    const response = await client.callTool({
      name: "moodle_get_site_info",
      arguments: {},
    });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).toContain("MOODLE");
    expect(JSON.stringify(response)).not.toContain("fixture-secret");
    expect((await client.listTools()).tools).toHaveLength(
      Object.keys(TOOL_FUNCTIONS).length,
    );
  });
  it("checks API capabilities when a tool runs without changing the advertised catalog", async () => {
    const actual = await upstream([]);
    const call = vi.spyOn(actual, "call");
    const client = await fixture(async () => actual);
    const result = await client.callTool({
      name: "moodle_list_courses",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("core_enrol_get_users_courses");
    expect(call).not.toHaveBeenCalled();
    expect((await client.listTools()).tools).toHaveLength(
      Object.keys(TOOL_FUNCTIONS).length,
    );
    const info = await client.callTool({
      name: "moodle_get_site_info",
      arguments: {},
    });
    expect(info.isError).not.toBe(true);
  });
  it("runs the existing Moodle tool after lazy connection succeeds", async () => {
    const actual = await upstream(["core_enrol_get_users_courses"]);
    vi.spyOn(actual, "call").mockResolvedValue([
      { id: 7, fullname: "Real tool fixture", shortname: "T" },
    ]);
    const create = vi.fn().mockResolvedValue(actual);
    const client = await fixture(create);
    expect(create).not.toHaveBeenCalled();
    const result = await client.callTool({
      name: "moodle_list_courses",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain("Real tool fixture");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("rejects resource access if the token lacks the required API even with a stable template", async () => {
    const actual = await upstream([]);
    const network = vi.spyOn(actual, "call");
    const client = await fixture(async () => actual);
    expect(
      (await client.listResourceTemplates()).resourceTemplates,
    ).toHaveLength(1);
    await expect(
      client.readResource({ uri: "moodle://files/example" }),
    ).rejects.toThrow(/cannot read/);
    expect(network).not.toHaveBeenCalled();
  });
});
