import { describe, it, expect, vi } from "vitest";
import { registerSiteInfoTool } from "../src/tools/siteinfo.js";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../src/moodle-client.js";
describe("full advertised API inventory is metadata, not permissions", () => {
  it("returns sorted function names without executing any advertised operation", async () => {
    const registerTool = vi.fn(),
      call = vi.fn();
    const source = {
      userId: 42,
      siteName: "Example",
      release: "4.5",
      supportedFunctions: new Set([
        "mod_assign_submit_for_grading",
        "core_course_get_contents",
      ]),
      profile: { functions: [] },
      supports: () => true,
      call,
    } as unknown as MoodleClient;
    registerSiteInfoTool(
      { registerTool } as unknown as McpServer,
      async () => source,
    );
    const result = await registerTool.mock.calls[0][2]({});
    expect(result.structuredContent.data.advertisedFunctions).toEqual([
      "core_course_get_contents",
      "mod_assign_submit_for_grading",
    ]);
    expect(call).not.toHaveBeenCalled();
  });
});
