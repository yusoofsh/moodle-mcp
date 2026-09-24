# Tool discovery regression — September 24, 2026

## Comparison performed

Reference inspected: `rahilp/second-brain-cloudflare` at
`eecd7e97287573381853e0152dbf833a7ebbb192`.

- `src/mcp/handler.ts` authenticates, constructs the MCP server and then delegates
  to the transport. Tool implementations execute their data work in callbacks.
- `src/mcp/sanitize.ts` removes unused `execution` metadata for strict clients.
  Our locked SDK 2.0.0 JSON responses already omit that undefined field; blindly
  importing the reference's SDK-v1 sanitizer would not fix the observed failure
  path. Regression checks now enforce its no-unused-task-metadata contract on
  actual HTTP tool lists.
- Our existing OAuth/password implementation, SDK and Durable Object remain in
  place. No auth/provider code or data was copied from the reference.

## Reproduced failure and correction

Baseline: `6270a3c727550a411b46774c8ae87acb394c5df4`.
An authenticated HTTP test with a rejected Moodle factory returned HTTP 500 on
`initialize` before any tools were registered. This is a reproduced failure path,
not proof of the private university's current credential state. Live logging was
not enabled and the owner's password, tokens and academic records were not read.

HTTP now registers a stable 14-tool catalog against a lazy Moodle factory.
`initialize`, notifications, `tools/list`, prompt discovery and resource-template
discovery need no Moodle request. Actual calls resolve the client and check required
capabilities. Missing APIs produce tool errors rather than disappearing tools.
File visibility/ownership reauthorization is retained. Initial connection failures
are safe MCP tool errors; failed connection promises are cleared for retries.
Site info accurately reports each tool's requirements instead of claiming that
basic course tools are always available. Initialized stdio callers retain filtering.

## Verification and boundary

Executed before commit: 130 Node tests across 14 files and 17 workerd integration
groups passed, including native Chromium/Firefox. Formatting, TypeScript, build,
Worker bundle and dependency advisory checks passed.

Node tests cover the authenticated HTTP failure and recovery boundary, all tool
schemas, OAuth scopes, rejected unauthenticated discovery, lazy resources and
capability checks. Workerd tests cover invalid-token discovery and recovery,
restricted capability catalogs, and a real official Streamable HTTP client across
requests. Explicit initialization revisions tested: 2024-11-05, 2025-03-26,
2025-06-18, and 2025-11-25. Existing Chromium/Firefox password and consent checks
remain required for deployment. Moodle responses in these tests are synthetic;
OAuth and Durable Object SQL are real.

The private ChatGPT session and live Moodle reads still require user-side
acceptance. Refresh/reconnect the MCP app and call `moodle_get_site_info`, then
`moodle_list_courses`. The catalog being visible does not establish that the
university has enabled those APIs. No production secrets, accounts, database,
permissions, binding names, migrations or billing settings are changed.
