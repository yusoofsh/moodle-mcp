import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools } from "../src/register-tools.js";
import { registerResources } from "../src/resources/index.js";

describe("Study Hub extension", () => {
  it("adds sidebar and thread metadata without changing authentication or input schema", () => {
    const registerTool = vi.fn();
    registerAllTools({ registerTool } as unknown as McpServer, async () => {
      throw new Error("must not fetch during discovery");
    });
    const [, config] = registerTool.mock.calls.find(
      ([name]) => name === "moodle_get_dashboard",
    )!;
    expect(config._meta.ui.resourceUri).toBe("ui://moodle/study-hub-v1.html");
    expect(config._meta["openai/ui"].entrypoints).toEqual([
      { type: "global" },
      { type: "thread" },
    ]);
    expect(config._meta.securitySchemes).toEqual([
      { type: "oauth2", scopes: ["moodle:read"] },
    ]);
    expect(config.annotations.readOnlyHint).toBe(true);
    expect(config.inputSchema.safeParse({ userId: 999 }).success).toBe(false);
  });
  it("serves the static UI without connecting to Moodle", async () => {
    const registerResource = vi.fn();
    const source = vi.fn().mockRejectedValue(new Error("no upstream"));
    registerResources({ registerResource } as unknown as McpServer, source);
    const registration = registerResource.mock.calls.find(
      ([, uri]) => uri === "ui://moodle/study-hub-v1.html",
    );
    expect(registration).toBeDefined();
    const result = await registration![3](
      new URL("ui://moodle/study-hub-v1.html"),
    );
    expect(result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(result.contents[0].text).toContain("Study Hub");
    expect(result.contents[0].text).toContain("ui/update-model-context");
    expect(result.contents[0].text).toContain("event.source !== window.parent");
    expect(result.contents[0].text).not.toContain("innerHTML");
    expect(result.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
    expect(source).not.toHaveBeenCalled();
  });
});
