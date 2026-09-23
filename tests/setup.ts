import { mock } from "bun:test";
// Only the Workers entrypoint base class is shimmed. OAuthProvider itself is real.
// No test result here proves Cloudflare runtime isolation or production KV semantics.
mock.module("cloudflare:workers", () => ({ WorkerEntrypoint: class {} }));
