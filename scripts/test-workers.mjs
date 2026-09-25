import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { strict as assert } from "node:assert";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../dist/auth/password.js";
import {
  TOOL_FUNCTIONS,
  TOOL_OPTIONAL_FUNCTIONS,
} from "../dist/tool-policy.js";

const ORIGIN = "http://localhost:3000";
const browserMode = process.argv.includes("--browser");
const REDIRECT = "https://client.example/callback";
const PASSWORD = "workers test passphrase only";
const storage = await mkdtemp(join(tmpdir(), "moodle-workerd-"));
let upstreamMode = "ok";
let studentMode = "ok";
const invokedFunctions = [];
let calls = 0,
  mf;
const bindings = {
  PUBLIC_URL: ORIGIN,
  ALLOW_INSECURE_HTTP: "true",
  AUTH_SECRET: "ab".repeat(32),
  AUTH_PASSWORD_HASH: await hashPassword(PASSWORD, true),
  MOODLE_URL: "https://moodle.example",
  MOODLE_TOKEN: "test-private-moodle-token",
};

async function start(override = {}) {
  const options = convertV4MiniflareOptions({
    name: "moodle-mcp",
    ...(browserMode ? { port: 3000 } : {}),
    modules: true,
    stripCfConnectingIp: false,
    scriptPath: ".wrangler/build/worker.js",
    compatibilityDate: "2026-09-23",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    durableObjects: { MOODLE_MCP: { className: "MoodleMcp", useSQLite: true } },
    bindings: { ...bindings, ...override },
    outboundService: async (request) => {
      assert.equal(new URL(request.url).origin, "https://moodle.example");
      calls++;
      if (upstreamMode === "invalid-token")
        return Response.json({
          exception: "moodle_exception",
          errorcode: "invalidtoken",
          message: "sensitive-token-in-upstream-error",
        });
      const target = new URL(request.url);
      if (target.pathname.startsWith("/webservice/pluginfile.php/")) {
        assert.equal(request.method, "GET");
        assert.equal(target.searchParams.get("token"), bindings.MOODLE_TOKEN);
        assert.ok(
          [
            "/webservice/pluginfile.php/70/mod_page/content/index.html",
            "/webservice/pluginfile.php/71/mod_book/chapter/901/index.html",
          ].includes(target.pathname),
        );
        return new Response(
          "<html><head><script>BAD-SCRIPT</script></head><body><h1>Exported learning material</h1><p>Real body &amp; examples.</p></body></html>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      const params = new URLSearchParams(await request.text());
      assert.equal(params.get("wstoken"), bindings.MOODLE_TOKEN);
      invokedFunctions.push(params.get("wsfunction"));
      switch (params.get("wsfunction")) {
        case "core_webservice_get_site_info":
          return Response.json({
            userid: 42,
            sitename: "Test Moodle",
            fullname: "Test Student",
            release: "4.5",
            functions: (upstreamMode === "no-capabilities"
              ? []
              : [
                  ...new Set([
                    ...Object.values(TOOL_FUNCTIONS).flat(),
                    ...Object.values(TOOL_OPTIONAL_FUNCTIONS).flat(),
                    "mod_url_get_urls_by_courses",
                    "core_course_get_course_module",
                  ]),
                ]
            ).map((name) => ({ name, version: "1" })),
          });
        case "core_course_get_course_module":
          assert.equal(params.get("cmid"), "201");
          return Response.json({ cm: { id: 201, course: 7, modname: "url" } });
        case "core_course_get_contents":
          assert.equal(params.get("courseid"), "7");
          return Response.json([
            {
              id: 1,
              name: "Recordings",
              modules: [
                {
                  id: 701,
                  instance: 801,
                  name: "Page fixture",
                  modname: "page",
                  uservisible: true,
                  description: "<p>Intro only</p>",
                  contents: [
                    {
                      type: "file",
                      filename: "index.html",
                      filepath: "/",
                      filesize: 0,
                      sortorder: 1,
                      fileurl:
                        "https://moodle.example/webservice/pluginfile.php/70/mod_page/content/index.html",
                    },
                  ],
                },
                {
                  id: 702,
                  instance: 802,
                  name: "Book fixture",
                  modname: "book",
                  uservisible: true,
                  contents: [
                    {
                      type: "content",
                      filename: "structure",
                      content: JSON.stringify([
                        {
                          title: "Chapter one",
                          href: "901/index.html",
                          hidden: 0,
                          subitems: [],
                        },
                      ]),
                    },
                    {
                      type: "file",
                      filename: "index.html",
                      filepath: "/901/",
                      filesize: 0,
                      fileurl:
                        "https://moodle.example/webservice/pluginfile.php/71/mod_book/chapter/901/index.html",
                    },
                  ],
                },
                {
                  id: 703,
                  instance: 803,
                  name: "Text notice",
                  modname: "label",
                  uservisible: true,
                  description: "<p>Read these instructions.</p>",
                },
                {
                  id: 705,
                  instance: 805,
                  name: "Forum fixture",
                  modname: "forum",
                  uservisible: true,
                },
                {
                  id: 301,
                  instance: 401,
                  name: "Essay",
                  modname: "assign",
                  uservisible: true,
                  completion: 2,
                  completiondata: { state: 0, istrackeduser: true },
                },
                {
                  id: 302,
                  instance: 402,
                  name: "Attendance",
                  modname: "attendance",
                  uservisible: true,
                  completion: 1,
                  completiondata: {
                    state: 3,
                    istrackeduser: true,
                    isoverallcomplete: false,
                  },
                },
                {
                  id: 201,
                  instance: 61,
                  name: "Tutor 1",
                  modname: "url",
                  uservisible: true,
                  contents: [
                    {
                      type: "url",
                      filename: "Tutor 1",
                      filepath: null,
                      filesize: 0,
                      fileurl:
                        "https://www.youtube.com/watch?v=example1234&t=42",
                      sortorder: null,
                    },
                  ],
                },
                {
                  id: 202,
                  instance: 62,
                  name: "Hidden recording",
                  modname: "url",
                  uservisible: false,
                },
              ],
            },
          ]);
        case "mod_url_get_urls_by_courses":
          assert.equal(params.get("courseids[0]"), "7");
          return Response.json({
            urls: [
              {
                id: 61,
                coursemodule: 201,
                course: 7,
                name: "Tutor 1",
                externalurl: "https://www.youtube.com/watch?v=example1234&t=42",
              },
              {
                id: 62,
                coursemodule: 202,
                course: 7,
                name: "Hidden recording",
                externalurl: "https://example.org/never-disclose",
              },
            ],
            warnings: [],
          });
        case "mod_forum_get_forums_by_courses":
          assert.equal(params.get("courseids[0]"), "7");
          return Response.json([
            {
              id: 805,
              cmid: 705,
              course: 7,
              name: "Forum fixture",
              type: "general",
              intro: "<p>Forum intro</p>",
              introformat: 1,
            },
          ]);
        case "mod_forum_get_forum_discussions":
          assert.equal(params.get("forumid"), "805");
          assert.equal(params.get("sortorder"), "-1");
          assert.equal(params.has("sortby"), false);
          return Response.json({
            discussions: [
              {
                id: 1101,
                discussion: 1001,
                name: "Topic fixture",
                userid: 55,
                userfullname: "Tutor fixture",
                numreplies: 1,
                message: "<p>First post body</p>",
                messageformat: 1,
                timemodified: 1790340000,
              },
            ],
            warnings: [],
          });
        case "mod_forum_get_discussion_posts":
          assert.equal(params.get("discussionid"), "1001");
          return Response.json({
            forumid: 805,
            courseid: 7,
            posts: [
              {
                id: 1101,
                discussionid: 1001,
                subject: "First post",
                message: "<p>Complete first post body</p>",
                messageformat: 1,
                parentid: null,
                timecreated: 1790340000,
                isdeleted: false,
                capabilities: { view: true },
                author: { id: 55, fullname: "Tutor" },
              },
              {
                id: 1102,
                discussionid: 1001,
                subject: "Reply",
                message: "Read-only reply text",
                messageformat: 2,
                parentid: 1101,
                timecreated: 1790340001,
                isdeleted: false,
                capabilities: { view: true },
              },
              {
                id: 1103,
                discussionid: 1001,
                message: "DO-NOT-EXPOSE-HIDDEN-POST",
                isdeleted: false,
                capabilities: { view: false },
              },
            ],
            warnings: [],
          });
        case "core_calendar_get_action_events_by_course":
        case "core_calendar_get_action_events_by_timesort":
          if (params.get("wsfunction").endsWith("_by_course"))
            assert.equal(params.get("courseid"), "7");
          else assert.equal(params.get("userid"), "42");
          return Response.json({
            events: [
              {
                id: 1201,
                name: "Essay due",
                course: { id: 7, fullname: "Test Moodle" },
                eventtype: "due",
                timestart: Math.floor(Date.now() / 1000) + 86400,
                timesort: Math.floor(Date.now() / 1000) + 86400,
                action: {
                  name: "Submit",
                  itemcount: 1,
                  actionable: true,
                  url: "https://moodle.example/mod/assign/view.php?id=301",
                },
              },
            ],
            firstid: 1201,
            lastid: 1201,
          });
        case "mod_assign_get_assignments":
          assert.equal(params.get("courseids[0]"), "7");
          return Response.json({
            courses: [
              {
                id: 7,
                assignments: [
                  {
                    id: 401,
                    cmid: 301,
                    course: 7,
                    name: "Essay",
                    duedate: 1800000000,
                    allowsubmissionsfromdate: 0,
                    cutoffdate: 1800086400,
                    grade: 100,
                    nosubmissions: 0,
                  },
                ],
              },
            ],
            warnings: [],
          });
        case "mod_assign_get_submission_status":
          assert.equal(params.get("assignid"), "401");
          assert.equal(params.get("userid"), "42");
          return Response.json({
            lastattempt: {
              submission: {
                userid: 42,
                status: "submitted",
                timemodified: 1790000000,
              },
              graded: true,
              submissionsenabled: true,
              extensionduedate: null,
            },
            feedback: {
              grade: { grade: "0.00000" },
              gradefordisplay: "0 / 100",
            },
            warnings: [],
          });
        case "core_completion_get_activities_completion_status":
          assert.equal(params.get("courseid"), "7");
          assert.equal(params.get("userid"), "42");
          return Response.json({
            statuses: [
              {
                cmid: 301,
                instance: 401,
                modname: "assign",
                tracking: 2,
                state: 2,
                istrackeduser: true,
                isoverallcomplete: true,
              },
              {
                cmid: 302,
                instance: 402,
                modname: "attendance",
                tracking: 1,
                state: 3,
                istrackeduser: true,
                isoverallcomplete: false,
              },
            ],
            warnings: [],
          });
        case "core_completion_get_course_completion_status":
          assert.equal(params.get("courseid"), "7");
          assert.equal(params.get("userid"), "42");
          if (studentMode === "unconfigured")
            return Response.json({
              exception: "moodle_exception",
              errorcode: "nocriteriaset",
              message: "private-upstream-diagnostic",
            });
          return Response.json({
            completionstatus: {
              completed: false,
              aggregation: 1,
              completions: [],
            },
            warnings: [],
          });
        case "mod_attendance_get_sessions":
          assert.equal(params.get("attendanceid"), "402");
          if (studentMode === "denied")
            return Response.json({
              exception: "required_capability_exception",
              errorcode: "nopermissions",
              message: "private-upstream-diagnostic",
            });
          return Response.json([
            {
              id: 501,
              attendanceid: 402,
              courseid: 7,
              sessdate: 1790000000,
              duration: 3600,
              statuses: [{ id: 1, description: "Present" }],
              users: [{ id: 42 }, { id: 99, firstname: "PRIVATE-OTHER" }],
              attendance_log: [
                { studentid: 42, statusid: "1", remarks: "On time" },
                { studentid: 99, statusid: "1", remarks: "PRIVATE-OTHER" },
              ],
            },
          ]);
        case "core_enrol_get_users_courses":
          return Response.json([
            { id: 7, fullname: "Sample course", shortname: "TEST" },
          ]);
        default:
          throw new Error("Unexpected Moodle call");
      }
    },
  });
  // Miniflare 5 does not forward the v4 durableObjectsPersist field.
  options.isolatedResourcePersistencePath = join(storage, "isolated");
  options.resourcePersistencePath = join(storage, "shared");
  mf = new Miniflare(options);
  await mf.ready;
}
class Browser {
  cookies = new Map();
  constructor(ip = "192.0.2.1") {
    this.ip = ip;
  }
  async request(path, options = {}) {
    const url = new URL(path, ORIGIN);
    assert.equal(url.origin, ORIGIN, "Do not follow external redirects");
    const headers = new Headers(options.headers);
    headers.set("CF-Connecting-IP", this.ip);
    if (this.cookies.size)
      headers.set(
        "Cookie",
        [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    const res = await mf.dispatchFetch(url.href, {
      ...options,
      headers,
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie()) {
      const part = c.split(";")[0],
        eq = part.indexOf("="),
        key = part.slice(0, eq),
        value = part.slice(eq + 1);
      if (!value || /Max-Age=0(?:;|$)/i.test(c)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      /* HTML and plaintext are intentional. */
    }
    return { status: res.status, headers: res.headers, text, json };
  }
  post(path, data) {
    return this.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(path.startsWith("/interaction") ? { Origin: ORIGIN } : {}),
      },
      body: new URLSearchParams(data),
    });
  }
  async follow(response) {
    for (
      let i = 0;
      i < 8 &&
      response.headers.has("location") &&
      new URL(response.headers.get("location"), ORIGIN).origin === ORIGIN;
      i++
    )
      response = await this.request(response.headers.get("location"));
    return response;
  }
}
const client = new Browser();
async function register(redirect = REDIRECT) {
  const r = await client.request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirect],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      client_name: "Workerd test client",
    }),
  });
  assert.equal(r.status, 201, r.text);
  return r.json.client_id;
}
async function begin(clientId, ip = "192.0.2.2") {
  const browser = new Browser(ip),
    verifier = randomBytes(32).toString("base64url");
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid offline_access moodle:read",
    resource: ORIGIN + "/mcp",
    state: "test-client-state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const form = await browser.follow(
    await browser.request("/oauth/authorize?" + q),
  );
  assert.equal(form.status, 200, form.text);
  const nonce = /name="csrf" value="([^"]+)"/.exec(form.text)?.[1];
  assert.ok(nonce, form.text);
  return { browser, verifier, nonce };
}
async function authorize(clientId, ip) {
  const flow = await begin(clientId, ip);
  const consent = await flow.browser.follow(
    await flow.browser.post("/interaction/password", {
      csrf: flow.nonce,
      password: PASSWORD,
    }),
  );
  assert.equal(consent.status, 200, consent.text);
  assert.match(consent.text, /Authorize Moodle MCP/);
  const csrf = /name="csrf" value="([^"]+)"/.exec(consent.text)?.[1];
  assert.ok(csrf);
  const res = await flow.browser.follow(
    await flow.browser.post("/interaction/confirm", {
      csrf,
      decision: "allow",
    }),
  );
  assert.ok(res.headers.has("location"), res.text);
  const redirect = new URL(res.headers.get("location"));
  assert.equal(redirect.origin, new URL(REDIRECT).origin);
  assert.equal(redirect.searchParams.get("state"), "test-client-state");
  assert.ok(redirect.searchParams.get("code"), redirect.href);
  return { ...flow, code: redirect.searchParams.get("code") };
}
function exchange(id, flow, overrides = {}) {
  return client.post("/oauth/token", {
    grant_type: "authorization_code",
    client_id: id,
    code: flow.code,
    code_verifier: flow.verifier,
    redirect_uri: REDIRECT,
    resource: ORIGIN + "/mcp",
    ...overrides,
  });
}
function rpc(token, method, params) {
  return client.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
try {
  await check("bundle fits Free plan and excludes node:sqlite", async () => {
    const bundle = await readFile(".wrangler/build/worker.js");
    const bytes = gzipSync(bundle).length;
    assert.ok(bytes < 3 * 1024 * 1024, `Gzipped bundle ${bytes} exceeds 3 MiB`);
    assert.ok(!bundle.toString().includes("node:sqlite"));
    console.log(`Worker bundle: ${bytes} bytes gzipped`);
  });
  await start();
  await check("health, discovery, and unauthenticated rejection", async () => {
    assert.equal((await client.request("/healthz")).status, 200);
    const discovery = await client.request(
      "/.well-known/oauth-authorization-server",
    );
    assert.equal(discovery.status, 200, discovery.text);
    assert.ok(discovery.json.code_challenge_methods_supported.includes("S256"));
    const unauth = await client.request("/mcp", { method: "POST" });
    assert.equal(unauth.status, 401);
    assert.match(
      unauth.headers.get("www-authenticate"),
      /oauth-protected-resource/,
    );
    assert.equal(calls, 0);
  });
  await check(
    "DCR accepts UTF-8 JSON and preserves media-type validation",
    async () => {
      for (const contentType of [
        "application/json",
        "application/json; charset=utf-8",
      ]) {
        const response = await client.request("/oauth/register", {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: JSON.stringify({
            redirect_uris: [REDIRECT],
            response_types: ["code"],
            grant_types: ["authorization_code", "refresh_token"],
            token_endpoint_auth_method: "none",
            client_name: "Moodle العربية",
          }),
        });
        assert.equal(response.status, 201, response.text);
        assert.equal(response.json.client_name, "Moodle العربية");
      }
      for (const [contentType, body] of [
        ["text/plain", "{}"],
        ["application/x-www-form-urlencoded", "redirect_uris=invalid"],
        ["application/json", "{invalid"],
      ]) {
        const response = await client.request("/oauth/register", {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        });
        assert.equal(response.status, 400, response.text);
        assert.equal(response.json.error, "invalid_request");
      }
    },
  );
  const id = await register();
  if (browserMode) {
    const { exerciseBrowserAuthorization } =
      await import("./browser-authorization.mjs");
    for (const name of ["chromium", "firefox"]) {
      await check(
        `${name}: native password, consent, PKCE and Moodle call`,
        async () => {
          await exerciseBrowserAuthorization(name, {
            origin: ORIGIN,
            password: PASSWORD,
            register,
            exchange,
            rpc,
          });
        },
      );
    }
  }
  let granted;
  await check("password, consent, PKCE exchange, code replay", async () => {
    const flow = await authorize(id, "192.0.2.2");
    const token = await exchange(id, flow);
    assert.equal(token.status, 200, token.text);
    assert.ok(token.json.refresh_token);
    assert.ok(!token.text.includes(PASSWORD));
    granted = token.json;
    const replay = await authorize(id, "192.0.2.3");
    assert.equal((await exchange(id, replay)).status, 200);
    assert.equal((await exchange(id, replay)).status, 400);
  });
  await check(
    "MCP initialize, all 21 read-only tools, Moodle request",
    async () => {
      const init = await rpc(granted.access_token, "initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "workerd-test", version: "1" },
      });
      assert.equal(init.status, 200, init.text);
      const tools = await rpc(granted.access_token, "tools/list", {});
      assert.equal(tools.status, 200, tools.text);
      assert.equal(
        tools.json.result.tools.length,
        Object.keys(TOOL_FUNCTIONS).length,
      );
      assert.ok(
        tools.json.result.tools.every((t) => t.annotations.readOnlyHint),
      );
      const result = await rpc(granted.access_token, "tools/call", {
        name: "moodle_list_courses",
        arguments: {},
      });
      assert.equal(result.status, 200, result.text);
      assert.match(result.text, /Sample course/);
      assert.ok(!result.text.includes(bindings.MOODLE_TOKEN));
    },
  );
  await check(
    "authenticated URL resolution and batch resource enrichment stay read-only",
    async () => {
      const resolved = await rpc(granted.access_token, "tools/call", {
        name: "moodle_resolve_url",
        arguments: { moduleId: 201 },
      });
      assert.equal(resolved.status, 200, resolved.text);
      assert.equal(
        resolved.json.result.structuredContent.externalurl,
        "https://www.youtube.com/watch?v=example1234&t=42",
      );
      assert.deepEqual(
        JSON.parse(resolved.json.result.content[0].text),
        resolved.json.result.structuredContent,
      );
      const resources = await rpc(granted.access_token, "tools/call", {
        name: "moodle_list_resources",
        arguments: { courseId: 7 },
      });
      assert.equal(resources.status, 200, resources.text);
      assert.equal(resources.json.result.structuredContent.links.length, 1);
      assert.equal(
        resources.json.result.structuredContent.text,
        resources.json.result.content[0].text,
      );
      assert.match(
        resources.json.result.content[0].text,
        /externalurl: https:\/\/www.youtube.com/,
      );
      assert.ok(!resources.text.includes("never-disclose"));
      assert.ok(!resources.text.includes(bindings.MOODLE_TOKEN));
      const hidden = await rpc(granted.access_token, "tools/call", {
        name: "moodle_resolve_url",
        arguments: { moduleId: 202, courseId: 7 },
      });
      assert.equal(hidden.json.result.isError, true);
      assert.ok(!hidden.text.includes("never-disclose"));
    },
  );
  await check(
    "assignment cmid mapping, structured parity and current-student status",
    async () => {
      const listing = await rpc(granted.access_token, "tools/call", {
        name: "moodle_list_assignments",
        arguments: { courseId: 7 },
      });
      assert.equal(listing.status, 200, listing.text);
      assert.notEqual(listing.json.result.isError, true, listing.text);
      const result = listing.json.result.structuredContent;
      assert.equal(result.schemaVersion, 1);
      assert.equal(result.data.items[0].assignmentId, 401);
      assert.equal(result.data.items[0].cmid, 301);
      assert.equal(result.data.items[0].dueDate, 1800000000);
      assert.deepEqual(JSON.parse(listing.json.result.content[0].text), result);
      const status = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_assignment",
        arguments: { assignmentId: 401 },
      });
      assert.equal(
        status.json.result.structuredContent.data.submissionStatus,
        "submitted",
      );
      assert.equal(
        status.json.result.structuredContent.data.feedback.grade,
        "0.00000",
      );
    },
  );
  await check(
    "completion distinguishes completed, failed, unconfigured and hidden",
    async () => {
      const activities = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_activity_completion",
        arguments: { courseId: 7 },
      });
      assert.equal(
        activities.json.result.structuredContent.data.summary.completed,
        1,
      );
      assert.equal(
        activities.json.result.structuredContent.data.summary.failed,
        1,
      );
      assert.ok(!activities.text.includes("Hidden recording"));
      studentMode = "unconfigured";
      const course = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_course_completion",
        arguments: { courseId: 7 },
      });
      assert.equal(course.json.result.structuredContent.data.completed, null);
      assert.equal(
        course.json.result.structuredContent.capabilities.courseCompletion,
        "not_configured",
      );
      assert.ok(!course.text.includes("private-upstream-diagnostic"));
      studentMode = "ok";
    },
  );
  await check(
    "Attendance inventory, self-only logs, permission denial, no auto-marking",
    async () => {
      const start = invokedFunctions.length;
      const inventory = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_attendance",
        arguments: { courseId: 7 },
      });
      assert.equal(
        inventory.json.result.structuredContent.data.activities.length,
        1,
      );
      assert.equal(inventory.json.result.structuredContent.data.sessions, null);
      assert.ok(
        !invokedFunctions.slice(start).includes("mod_attendance_get_sessions"),
      );
      const details = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_attendance",
        arguments: { courseId: 7, moduleId: 302 },
      });
      assert.equal(
        details.json.result.structuredContent.data.sessions[0].statusLabel,
        "Present",
      );
      assert.ok(!details.text.includes("PRIVATE-OTHER"));
      studentMode = "denied";
      const denied = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_attendance",
        arguments: { courseId: 7, moduleId: 302 },
      });
      assert.equal(
        denied.json.result.structuredContent.capabilities.attendanceSessions,
        "forbidden",
      );
      assert.equal(denied.json.result.structuredContent.data.sessions, null);
      studentMode = "ok";
      assert.ok(
        !invokedFunctions.some(
          (fn) =>
            fn === "tool_mobile_get_content" ||
            /mark|update|submit|save|set_/.test(fn),
        ),
      );
      const info = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_site_info",
        arguments: {},
      });
      assert.equal(
        info.json.result.structuredContent.data.catalog.toolCount,
        Object.keys(TOOL_FUNCTIONS).length,
      );
    },
  );
  await check(
    "Page/Book exported HTML and label text are readable without browser views",
    async () => {
      for (const moduleId of [701, 702, 703]) {
        const r = await rpc(granted.access_token, "tools/call", {
          name: "moodle_get_resource",
          arguments: { moduleId, courseId: 7 },
        });
        assert.equal(r.status, 200, r.text);
        assert.notEqual(r.json.result.isError, true, r.text);
        const result = r.json.result.structuredContent;
        assert.equal(result.data.contentStatus, "available");
        assert.equal(result.data.content.untrusted, true);
        assert.match(
          result.data.content.text,
          moduleId === 703 ? /Read these instructions/ : /Real body & examples/,
        );
        assert.ok(!r.text.includes("BAD-SCRIPT"));
        assert.ok(!r.text.includes(bindings.MOODLE_TOKEN));
        assert.deepEqual(JSON.parse(r.json.result.content[0].text), result);
      }
    },
  );
  await check(
    "forum instance IDs, discussion IDs and permitted thread bodies use correct API contracts",
    async () => {
      const forums = await rpc(granted.access_token, "tools/call", {
        name: "moodle_list_forums",
        arguments: { courseId: 7 },
      });
      assert.equal(
        forums.json.result.structuredContent.data.items[0].forumId,
        805,
      );
      assert.equal(
        forums.json.result.structuredContent.data.items[0].cmid,
        705,
      );
      const discussions = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_forum_discussions",
        arguments: { forumId: 805 },
      });
      assert.equal(
        discussions.json.result.structuredContent.data.items[0].discussionId,
        1001,
      );
      assert.match(
        discussions.json.result.structuredContent.data.items[0].content.text,
        /First post body/,
      );
      const thread = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_forum_thread",
        arguments: { discussionId: 1001 },
      });
      assert.equal(thread.json.result.structuredContent.data.items.length, 2);
      assert.equal(
        thread.json.result.structuredContent.data.items[1].parentId,
        1101,
      );
      assert.ok(!thread.text.includes("DO-NOT-EXPOSE-HIDDEN-POST"));
    },
  );
  await check(
    "bounded dashboard and course-scoped action timeline preserve structured output",
    async () => {
      const calendar = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_calendar_events",
        arguments: { courseId: 7 },
      });
      assert.notEqual(calendar.json.result.isError, true, calendar.text);
      assert.equal(
        calendar.json.result.structuredContent.data.items[0].courseId,
        7,
      );
      const dashboard = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_dashboard",
        arguments: { maxCourses: 1 },
      });
      assert.notEqual(dashboard.json.result.isError, true, dashboard.text);
      assert.equal(
        dashboard.json.result.structuredContent.data.courses.length,
        1,
      );
      assert.equal(
        dashboard.json.result.structuredContent.data.timeline.items[0]
          .isDeadline,
        true,
      );
      assert.ok(
        !invokedFunctions.some((fn) =>
          /_view_|_mark_|_save_|_submit_|tool_mobile_get_content/.test(fn),
        ),
      );
    },
  );
  await check(
    "authenticated discovery survives Moodle failure and recovers on retry",
    async () => {
      await mf.dispose();
      upstreamMode = "invalid-token";
      await start();
      const before = calls;
      for (const version of [
        "2024-11-05",
        "2025-03-26",
        "2025-06-18",
        "2025-11-25",
      ]) {
        const init = await rpc(granted.access_token, "initialize", {
          protocolVersion: version,
          capabilities: {},
          clientInfo: { name: "compat-discovery", version: "1" },
        });
        assert.equal(init.status, 200, init.text);
        assert.equal(init.json.result.protocolVersion, version);
        assert.ok(init.json.result.capabilities.tools);
      }
      const listing = await rpc(granted.access_token, "tools/list", {});
      assert.equal(listing.status, 200, listing.text);
      assert.equal(
        listing.json.result.tools.length,
        Object.keys(TOOL_FUNCTIONS).length,
      );
      for (const tool of listing.json.result.tools) {
        assert.ok(
          !Object.hasOwn(tool, "execution"),
          "Do not emit unused task metadata to strict clients",
        );
        assert.equal(tool.inputSchema.type, "object");
        assert.deepEqual(tool._meta.securitySchemes, [
          { type: "oauth2", scopes: ["moodle:read"] },
        ]);
      }
      assert.equal(calls, before, "Discovery must not fetch the Moodle API");
      const failed = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_site_info",
        arguments: {},
      });
      assert.equal(failed.status, 200, failed.text);
      assert.equal(failed.json.result.isError, true);
      assert.match(failed.text, /Invalid Moodle token/);
      assert.ok(!failed.text.includes("sensitive-token-in-upstream-error"));
      upstreamMode = "ok";
      const recovered = await rpc(granted.access_token, "tools/call", {
        name: "moodle_list_courses",
        arguments: {},
      });
      assert.equal(recovered.status, 200, recovered.text);
      assert.match(recovered.text, /Sample course/);
    },
  );
  await check(
    "official Streamable HTTP client discovers tools across requests",
    async () => {
      const sdkClient = new Client({
        name: "official-http-discovery",
        version: "1",
      });
      const transport = new StreamableHTTPClientTransport(
        new URL(ORIGIN + "/mcp"),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${granted.access_token}` },
          },
          fetch: (input, init) =>
            mf.dispatchFetch(
              input instanceof Request ? input.url : String(input),
              init,
            ),
        },
      );
      try {
        await sdkClient.connect(transport);
        const listing = await sdkClient.listTools();
        assert.equal(listing.tools.length, Object.keys(TOOL_FUNCTIONS).length);
        const result = await sdkClient.callTool({
          name: "moodle_list_courses",
          arguments: {},
        });
        assert.notEqual(result.isError, true);
        assert.match(JSON.stringify(result), /Sample course/);
      } finally {
        await sdkClient.close();
      }
    },
  );
  await check(
    "catalog does not disappear when Moodle token capabilities are restricted",
    async () => {
      await mf.dispose();
      upstreamMode = "no-capabilities";
      await start();
      const listing = await rpc(granted.access_token, "tools/list", {});
      assert.equal(listing.status, 200);
      assert.equal(
        listing.json.result.tools.length,
        Object.keys(TOOL_FUNCTIONS).length,
      );
      const denied = await rpc(granted.access_token, "tools/call", {
        name: "moodle_list_courses",
        arguments: {},
      });
      assert.equal(denied.status, 200);
      assert.equal(denied.json.result.isError, true);
      assert.match(denied.text, /core_enrol_get_users_courses/);
      const info = await rpc(granted.access_token, "tools/call", {
        name: "moodle_get_site_info",
        arguments: {},
      });
      assert.equal(info.status, 200);
      assert.notEqual(info.json.result.isError, true);
      assert.equal(
        info.json.result.structuredContent.capabilities.activityCompletion,
        "not_advertised",
      );
      await mf.dispose();
      upstreamMode = "ok";
      await start();
    },
  );
  await check("OAuth persists across workerd process restart", async () => {
    await mf.dispose();
    await start();
    const result = await rpc(granted.access_token, "tools/list", {});
    assert.equal(result.status, 200, result.text);
    assert.equal(
      result.json.result.tools.length,
      Object.keys(TOOL_FUNCTIONS).length,
    );
  });
  await check("refresh rotation and replay family revocation", async () => {
    const refresh = (value) =>
      client.post("/oauth/token", {
        grant_type: "refresh_token",
        client_id: id,
        refresh_token: value,
        resource: ORIGIN + "/mcp",
      });
    const rotated = await refresh(granted.refresh_token);
    assert.equal(rotated.status, 200, rotated.text);
    assert.notEqual(rotated.json.refresh_token, granted.refresh_token);
    assert.equal((await refresh(granted.refresh_token)).status, 400);
    assert.equal(
      (await rpc(rotated.json.access_token, "tools/list", {})).status,
      401,
    );
  });
  await check("wrong password, one-use nonce, foreign Origin", async () => {
    const flow = await begin(id, "192.0.2.4");
    const wrong = await flow.browser.post("/interaction/password", {
      csrf: flow.nonce,
      password: "not the password",
    });
    assert.equal(wrong.status, 401, wrong.text);
    assert.ok(!wrong.text.includes("not the password"));
    assert.equal(
      (
        await flow.browser.post("/interaction/password", {
          csrf: flow.nonce,
          password: PASSWORD,
        })
      ).status,
      403,
    );
    const nonce = /name="csrf" value="([^"]+)"/.exec(wrong.text)?.[1];
    assert.ok(nonce);
    const cross = await flow.browser.request("/interaction/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://evil.example",
      },
      body: new URLSearchParams({ csrf: nonce, password: PASSWORD }),
    });
    assert.equal(cross.status, 403);
  });
  await check("password throttle persists across restart", async () => {
    const flow = await begin(id, "192.0.2.50");
    let nonce = flow.nonce;
    for (let i = 0; i < 3; i++) {
      const r = await flow.browser.post("/interaction/password", {
        csrf: nonce,
        password: "wrong passphrase",
      });
      assert.equal(r.status, 401, r.text);
      nonce = /name="csrf" value="([^"]+)"/.exec(r.text)?.[1];
      assert.ok(nonce);
    }
    await mf.dispose();
    await start();
    for (let i = 0; i < 2; i++) {
      const r = await flow.browser.post("/interaction/password", {
        csrf: nonce,
        password: "wrong passphrase",
      });
      assert.equal(r.status, 401, r.text);
      nonce = /name="csrf" value="([^"]+)"/.exec(r.text)?.[1];
      assert.ok(nonce);
    }
    const throttled = await flow.browser.post("/interaction/password", {
      csrf: nonce,
      password: PASSWORD,
    });
    assert.equal(throttled.status, 429, throttled.text);
    assert.ok(throttled.headers.has("retry-after"));
  });
  await check("body bounds, origin checks, unknown paths", async () => {
    const large = await client.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(129 * 1024),
    });
    assert.equal(large.status, 413, large.text);
    assert.equal(
      (
        await client.request("/mcp", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal((await client.request("/unconfigured-route")).status, 404);
  });
  await check(
    "password rotation rejects persisted access and refresh tokens",
    async () => {
      const flow = await authorize(id, "192.0.2.70");
      const r = await exchange(id, flow);
      assert.equal(r.status, 200, r.text);
      await mf.dispose();
      await start({
        AUTH_PASSWORD_HASH: await hashPassword(
          "a different workers passphrase",
          true,
        ),
      });
      assert.equal(
        (await rpc(r.json.access_token, "tools/list", {})).status,
        401,
      );
      const refresh = await client.post("/oauth/token", {
        grant_type: "refresh_token",
        client_id: id,
        refresh_token: r.json.refresh_token,
        resource: ORIGIN + "/mcp",
      });
      assert.equal(refresh.status, 400, refresh.text);
    },
  );
  await check("missing secrets fail closed", async () => {
    await mf.dispose();
    await start({ AUTH_PASSWORD_HASH: "" });
    assert.equal(
      (await client.request("/mcp", { method: "POST" })).status,
      503,
    );
  });
  console.log(`Workers runtime checks: ${checks.length} passed`);
} finally {
  await mf?.dispose();
  await rm(storage, { recursive: true, force: true });
}
