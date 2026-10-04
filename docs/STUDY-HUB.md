# Study Hub

The existing `moodle_get_dashboard` tool exposes a portable MCP Apps view and OpenAI sidebar/conversation entrypoints. No tool name, input schema, OAuth scope, or write permission changes. Clients without UI support keep the original structured result.

The view offers bounded course progress, the action timeline, submission-aware tasks, and visible-material metadata search using existing read adapters. It follows returned page cursors and keeps partial coverage, unavailable data and unknown completion explicit. It never treats a past opening event as a missed deadline, or an empty bounded page as the complete semester.

Select an item to inspect it. The optional context button uses the host's `ui/update-model-context` capability only after a click. This prepares the next message; it does not send a message or submit coursework. A host without that capability keeps the selection visible without a misleading enabled button.

The static resource contains no account data, external script, network endpoint, or stored browser credentials. Dynamic content uses DOM text nodes. The existing authenticated MCP endpoint protects all live reads; course/file access checks remain unchanged. Real host rendering and live course coverage are separate from fixture/browser checks.

Upstream policy: compare against the registered parent before every maintenance release. Keep all custom read, SSO, document and permission contracts; resolve changes through a tested merge rather than reset the fork.

References: https://developers.openai.com/plugins/build/extensions and https://modelcontextprotocol.io/docs/extensions/apps
