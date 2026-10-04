import { ProtocolError, type McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { workflowSkills } from "./skills.js";
import { privateResult } from "./core.js";
export function registerWorkflowMethods(server: McpServer) {
  if (!server.server) return;
  server.server.registerCapabilities({
    extensions: { "io.modelcontextprotocol/skills": {} },
  });
  server.server.setRequestHandler(
    "skills/list",
    {
      params: z.object({ cursor: z.string().optional() }).strict(),
      result: z.object({}).passthrough(),
    },
    (params) => {
      if (params.cursor !== undefined)
        throw new ProtocolError(-32602, "Invalid skills cursor");
      return {
        ...privateResult(workflowSkills.list(), 30000),
        resultType: "complete",
      };
    },
  );
  server.server.setRequestHandler(
    "skills/get",
    {
      params: z.object({ uri: z.string().max(300) }).strict(),
      result: z.object({}).passthrough(),
    },
    (params) => {
      try {
        return {
          ...privateResult(workflowSkills.get(params.uri), 30000),
          resultType: "complete",
        };
      } catch {
        throw new ProtocolError(-32602, "Unknown skill");
      }
    },
  );
}
