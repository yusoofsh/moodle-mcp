#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config.js";
import { MoodleClient } from "./moodle-client.js";
import { registerAllTools } from "./register-tools.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

if (process.stdin.isTTY && !process.env.MOODLE_URL) {
  console.log(`moodle-mcp v0.3.0 — private OAuth fork

Local stdio: set MOODLE_URL and MOODLE_TOKEN securely, then configure your MCP
client to run node with the absolute path to this checkout's dist/server.js.
The upstream npx package does not select this fork.

Hosted ChatGPT: follow docs/CHATGPT-OAUTH.md. The Worker requires owner-only
OAuth and is served at your canonical HTTPS origin's /mcp endpoint.

Guide: https://github.com/yusoofsh/moodle-mcp
`);
  process.exit(0);
}

async function main() {
  const config = getConfig();
  const client = await MoodleClient.create(config);

  const server = new McpServer({
    name: "moodle-mcp",
    version: "0.3.0",
  });

  registerAllTools(server, client);
  registerResources(server, client);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start moodle-mcp:", err.message);
  process.exit(1);
});
