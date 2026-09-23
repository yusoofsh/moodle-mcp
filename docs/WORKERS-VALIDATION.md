# Workers migration validation — 0.5.0

Validated source commit: `ff5793924ba6803c5423c45d5748c21871231e48`.

[Successful GitHub Actions run](https://github.com/yusoofsh/moodle-mcp/actions/runs/35888432112), September 23, 2026.

## Executed results

- Strict TypeScript check and build passed.
- 102 Vitest tests passed across 10 files, including the existing password and GitHub OAuth behavior.
- Wrangler bundled the Worker: 605,044 bytes gzipped, below the 3 MiB Free deployment limit. The bundle excludes `node:sqlite`.
- 11 workerd integration groups passed: bundle checks; discovery and unauthorized access; password login, separate consent, PKCE and code replay; MCP initialization and all 14 read-only tools; persistent OAuth state across a complete runtime restart; refresh rotation and replay revocation; password failure, nonce replay and Origin validation; persistent login throttling across restart; body limits and unknown routes; password rotation; missing-secret failure.
- `bun audit` reported no vulnerabilities in the 288 packages checked at that time.

The integration suite runs the bundled application with real OAuth code and Durable Object SQLite. Only Moodle network responses are mocked. These results are not a live university/ChatGPT acceptance test or an independent audit. Production Cloudflare CPU accounting was not measured.

The permanent publication workflow now runs the Workers build and integration suite before publishing an OCI image. The temporary source-preparation/formatting workflow has been removed. Normal CI does not modify repository source.

## Deployment status

The repository is deployable through Wrangler or the manually triggered Workers deployment workflow. This validation did not upload a Worker to the owner's Cloudflare account, set production secrets, change billing, or migrate/delete existing container data. Follow [the deployment guide](CLOUDFLARE.md) and reconnect clients at the new origin.

The upstream OAuth provider officially targets Node.js and warns under the compatibility runtime. The workerd suite provides tested compatibility, not an upstream support guarantee. Retest locked dependency and runtime upgrades before rollout.
