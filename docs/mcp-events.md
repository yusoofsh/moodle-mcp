# MCP Events

Implements authenticated `events/list`, `events/subscribe`, and `events/unsubscribe` on the MCP endpoint with `server/discover` advertising `capabilities.events` when configured. Reference-only event payloads use Standard Webhooks HMAC-SHA256 signatures, fresh delivery timestamps, stable event IDs, HTTPS callback challenge verification, finite leases, and bounded retries. A 410 response removes a subscription; 413 and permanent client errors stop retries. Duplicate delivery is possible; receivers must deduplicate `eventId`.

Callbacks must use public HTTPS on port 443. Every attempt resolves DNS afresh, rejects private/special destinations and connects to the validated address while retaining TLS hostname verification. Redirects are never followed. Callback receipts are limited to 16 KiB; event bodies to 256 KiB. Subscriptions and pending delivery credentials are encrypted at rest. Retrieve full content using the existing authenticated read tools.

## Event and configuration

`course.content.changed` requires string `course_id`. Added/changed course modules produce `course_id`, `module_id`, `change`, and `url`. Subscription creation and each delivery recheck the OAuth grant and current course enrolment. A 60-second Durable Object alarm polls only subscribed courses; Node deployments use a timer. Snapshots and delivery queues share encrypted OAuth SQLite storage.

Node delivery is direct. Cloudflare Workers require `MCP_EVENTS_RELAY_URL` (the HTTPS `/deliver` endpoint) and secret `MCP_EVENTS_RELAY_TOKEN`. Without both, Workers do not advertise events. Deploy the authenticated relay provided in `yusoofsh/infrastruct-mcp`; Workers HTTPS ignores DNS pinning options, so direct delivery there is deliberately disabled. Relay credentials belong in runtime secrets, never committed files.

Maximum lease: 24 hours. `cursor:null`: no historical replay. Module removals and transient changes between polls are outside this event's scope.

## Verification and rollout

Local tests cover the event contract with test callback receipts, temporary durable stores, and relevant authenticated MCP transports. These checks do not establish live ChatGPT subscription delivery. After deployment, rescan the plugin, create a subscription, receive and validate the callback, verify refresh/unsubscribe/revocation, restart the service and confirm recovery. Keep activation disabled until runtime configuration is present.

Reference: https://developers.openai.com/plugins/build/mcp-events
