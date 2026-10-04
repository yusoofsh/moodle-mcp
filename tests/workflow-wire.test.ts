import { it, expect, vi } from "vitest";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { registerAllTools } from "../src/register-tools.js";
import { registerResources } from "../src/resources/index.js";
function rpc(method: string, params: Record<string, unknown> = {}) {
  return new Request("https://fixture.invalid/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(typeof (params.name ?? params.uri) === "string"
        ? { "mcp-name": String(params.name ?? params.uri) }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {
            elicitation: { form: {} },
            extensions: { "io.modelcontextprotocol/skills": {} },
          },
        },
      },
    }),
  });
}
it("serves skills and real multi-round input without reading a course on decline", async () => {
  const source = vi
    .fn()
    .mockRejectedValue(new Error("Do not read fixture data"));
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "fixture", version: "1" });
      registerAllTools(server, source);
      registerResources(server, source);
      return server;
    },
    { legacy: "reject" },
  );
  try {
    const skills = (await (
      await handler.fetch(rpc("skills/list"))
    ).json()) as any;
    expect(skills.result.resultType).toBe("complete");
    expect(skills.result.skills).toHaveLength(2);
    const uri = skills.result.skills[0].uri;
    const get = (await (
      await handler.fetch(rpc("skills/get", { uri }))
    ).json()) as any;
    expect(get.result.skill.uri).toBe(uri);
    const resource = (await (
      await handler.fetch(rpc("resources/read", { uri }))
    ).json()) as any;
    expect(resource.result.cacheScope).toBe("private");
    expect(resource.result.contents[0].text).toContain("name:");
    const first = (await (
      await handler.fetch(
        rpc("tools/call", { name: "moodle_plan_study", arguments: {} }),
      )
    ).json()) as any;
    expect(first.result.resultType).toBe("input_required");
    expect(first.result.inputRequests.study_window.params.mode).toBe("form");
    const declined = (await (
      await handler.fetch(
        rpc("tools/call", {
          name: "moodle_plan_study",
          arguments: {},
          inputResponses: { study_window: { action: "decline" } },
        }),
      )
    ).json()) as any;
    expect(declined.result.resultType).toBe("complete");
    expect(declined.result.content[0].text).toContain("cancelled");
    expect(source).not.toHaveBeenCalled();
  } finally {
    await handler.close();
  }
});
