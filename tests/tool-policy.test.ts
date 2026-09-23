import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAllTools } from "../src/register-tools.js";
import { registerResources } from "../src/resources/index.js";
import { READ_ONLY, TOOL_FUNCTIONS, canRegister } from "../src/tool-policy.js";
import { reauthorize } from "../src/tools/download.js";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../src/moodle-client.js";

afterEach(() => vi.unstubAllGlobals());
describe("read-only tools and file access", () => {
  it("only advertises site information when no Moodle APIs are available", () => {
    const registerTool = vi.fn();
    registerAllTools({registerTool} as unknown as McpServer,{supports:()=>false} as unknown as MoodleClient);
    expect(registerTool.mock.calls.map(call=>call[0])).toEqual(["moodle_get_site_info"]);
  });
  it("registers 14 tools with read-only and OAuth annotations", () => {
    const registerTool=vi.fn();
    registerAllTools({registerTool} as unknown as McpServer,{supports:()=>true} as unknown as MoodleClient);
    expect(registerTool).toHaveBeenCalledTimes(Object.keys(TOOL_FUNCTIONS).length);
    for(const [,options] of registerTool.mock.calls){
      expect(options.annotations).toEqual(READ_ONLY);
      expect(options._meta.securitySchemes[0].scopes).toEqual(["moodle:read"]);
    }
  });
  it("refuses hidden modules during file reauthorization", async () => {
    const client={call:vi.fn().mockResolvedValue([{modules:[{uservisible:false,contents:[{type:"file",fileurl:"https://school.example/pluginfile.php/a"}]}]}])} as unknown as MoodleClient;
    expect(await reauthorize(client,{userId:1,courseId:2,fileurl:"https://school.example/pluginfile.php/a",filename:"a",filesize:1,mime:"text/plain"})).toBe(false);
  });
  it("rechecks Moodle permission before an MCP resource download", async () => {
    const registerResource=vi.fn(),downloadFile=vi.fn();
    const client={supports:()=>true,userId:1,fileIdStore:{open:async()=>({courseId:2,fileurl:"https://school.example/pluginfile.php/a"})},call:async()=>[{modules:[]}],downloadFile} as unknown as MoodleClient;
    registerResources({registerResource} as unknown as McpServer,client);
    const handler=registerResource.mock.calls[0][3];
    await expect(handler(new URL("moodle://files/f_test"),{fileId:"f_test"})).rejects.toThrow("Access denied");
    expect(downloadFile).not.toHaveBeenCalled();
  });
  it("never advertises an uncurated function even when Moodle permits it", () => {
    const client={supports:()=>true} as unknown as MoodleClient;
    expect(canRegister(client,"moodle_submit_assignment")).toBe(false);
    expect(canRegister(client,"core_user_delete_users")).toBe(false);
  });
});
// Worker HTTP fail-closed behavior is tested in workerd by scripts/test-workers.mjs.
