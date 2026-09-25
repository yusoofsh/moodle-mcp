import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MoodleClient } from "../src/moodle-client.js";
import {
  READ_OPERATIONS,
  invokeReadOperation,
  sanitizeApiResult,
} from "../src/student/safe-api.js";
import { apiCoverage } from "../src/student/coverage-report.js";
import { MOODLE_DECLARATIONS } from "../src/generated/moodle-api-declarations.js";
import "../src/tools/coverage.js";
let call: ReturnType<typeof vi.fn>, client: MoodleClient;
beforeEach(() => {
  call = vi.fn(async (fn: string) =>
    fn === "core_course_get_contents"
      ? [
          {
            id: 1,
            name: "Week",
            modules: [
              {
                id: 101,
                instance: 201,
                name: "Page",
                modname: "page",
                uservisible: true,
              },
              {
                id: 102,
                instance: 202,
                name: "Hidden page",
                modname: "page",
                uservisible: false,
              },
            ],
          },
        ]
      : { ok: true },
  );
  client = {
    userId: 42,
    siteUrl: "https://moodle.example",
    profile: { functions: [] },
    supportedFunctions: new Set(Object.keys(READ_OPERATIONS)),
    supports: () => true,
    call,
  } as unknown as MoodleClient;
});
describe("explicit API allowlist", () => {
  it.each([
    "mod_assign_save_submission",
    "mod_quiz_start_attempt",
    "mod_quiz_get_attempt_data",
    "mod_lesson_get_page_data",
    "tool_mobile_get_content",
    "tool_mobile_call_external_functions",
    "tool_mobile_get_autologin_key",
    "core_message_mark_message_read",
    "core_user_update_user_preferences",
    "constructor",
    "__proto__",
  ])(
    "blocks unreviewed or mutating function %s before any call",
    async (name) => {
      await expect(invokeReadOperation(client, name, {})).rejects.toThrow(
        /registry/,
      );
      expect(call).not.toHaveBeenCalled();
    },
  );
  it("never derives permission from an advertised name", async () => {
    client.supportedFunctions.add("mod_assign_save_submission");
    const r = apiCoverage(client);
    expect(
      r.data.entries.find((x) => x.name === "mod_assign_save_submission")
        ?.route,
    ).toBe("not_exposed");
  });
  it.each(Object.keys(READ_OPERATIONS))(
    "does not knowingly expose an upstream-declared write: %s",
    (name) => {
      expect(MOODLE_DECLARATIONS[name]?.type).not.toBe("write");
      expect(
        /_view_|_mark_|_save_|_submit_|_launch_|_prepare_|_start_/.test(name),
      ).toBe(false);
    },
  );
  it("injects current identity and rejects caller userId or raw URL fields", async () => {
    await invokeReadOperation(client, "core_user_get_users_by_field", {});
    expect(call).toHaveBeenLastCalledWith("core_user_get_users_by_field", {
      field: "id",
      "values[0]": 42,
    });
    await expect(
      invokeReadOperation(client, "core_user_get_users_by_field", {
        userid: 99,
      }),
    ).rejects.toThrow();
    await expect(
      invokeReadOperation(client, "core_message_get_conversations", {
        url: "https://evil.example",
      }),
    ).rejects.toThrow();
  });
  it("binds messages to the current user and does not mark read", async () => {
    await invokeReadOperation(
      client,
      "core_message_get_conversation_messages",
      { conversationId: 5, limit: 10 },
    );
    expect(call).toHaveBeenCalledWith(
      "core_message_get_conversation_messages",
      {
        currentuserid: 42,
        convid: 5,
        limitfrom: 0,
        limitnum: 10,
        newest: false,
        timefrom: 0,
      },
    );
  });
  it("enforces course and module visibility before group queries", async () => {
    await expect(
      invokeReadOperation(client, "core_group_get_activity_allowed_groups", {
        courseId: 7,
        moduleId: 102,
      }),
    ).rejects.toThrow(/visible/);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("limits participant fields and requests bounded server-side pagination", async () => {
    await invokeReadOperation(client, "core_enrol_get_enrolled_users", {
      courseId: 7,
      offset: 20,
      limit: 10,
    });
    expect(call.mock.calls[1][1]).toMatchObject({
      "options[0][value]": 20,
      "options[1][value]": 10,
      "options[2][value]": "id,fullname",
    });
  });
  it("filters by-course metadata against current visible course/module IDs", async () => {
    const original = call.getMockImplementation()!;
    call.mockImplementation(async (fn, p) =>
      fn === "mod_page_get_pages_by_courses"
        ? {
            pages: [
              { id: 201, course: 7, coursemodule: 101, name: "Allowed" },
              { id: 202, course: 7, coursemodule: 102, name: "SECRET HIDDEN" },
              { id: 201, course: 99, coursemodule: 101, name: "SECRET OTHER" },
            ],
          }
        : original(fn, p),
    );
    const r = await invokeReadOperation(
      client,
      "mod_page_get_pages_by_courses",
      { courseId: 7 },
    );
    expect(r.data.result).toEqual([
      { id: 201, course: 7, coursemodule: 101, name: "Allowed" },
    ]);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("keeps unsupported and failed reads unknown instead of successful empty", async () => {
    client.supports = () => false;
    const r = await invokeReadOperation(
      client,
      "core_message_get_conversations",
      {},
    );
    expect(r.data.result).toBeNull();
    expect(r.capabilities.core_message_get_conversations).toBe(
      "not_advertised",
    );
  });
  it("rejects unbounded or reversed calendar windows", async () => {
    await expect(
      invokeReadOperation(client, "core_calendar_get_calendar_events", {
        from: 100,
        to: 90,
      }),
    ).rejects.toThrow();
    await expect(
      invokeReadOperation(client, "core_calendar_get_calendar_events", {
        from: 0,
        to: 91 * 86400,
      }),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it("distinguishes inventory, routes, declaration type and live verification", () => {
    client.supportedFunctions = new Set([
      "core_message_get_conversations",
      "mod_assign_save_submission",
      "unreviewed_plugin_get_state",
    ]);
    const r = apiCoverage(client, { includeInputSchemas: true });
    expect(r.data.advertisedApiCount).toBe(3);
    expect(r.data.functionRoutes).toBe(1);
    expect(
      r.data.entries.every((e) => !e.liveTested && !e.permissionVerified),
    ).toBe(true);
    expect(r.data.inventoryCoveragePercent).toBe(100);
    expect(r.data.functionRoutePercent).toBeLessThan(100);
  });
});
describe("bounded API result sanitization", () => {
  it("withholds secret fields, preferences and token URL values", () => {
    const r = sanitizeApiResult(
      {
        token: "PRIVATE",
        nested: { access_token: "PRIVATE" },
        prefs: [{ name: "autologin_key", value: "PRIVATE" }],
        link: "https://moodle.example/file?token=PRIVATE&id=5",
        html: "<script>PRIVATE</script><p>Visible</p>",
      },
      "https://moodle.example",
    );
    expect(JSON.stringify(r)).not.toContain("PRIVATE");
    expect(JSON.stringify(r)).toContain("Visible");
    expect(r.redactedFields).toBeGreaterThan(0);
  });
  it("preserves false/zero and reports oversized collections as partial", () => {
    const r = sanitizeApiResult(
      {
        grade: 0,
        completed: false,
        items: Array.from({ length: 300 }, (_, id) => ({ id })),
      },
      "https://moodle.example",
    );
    expect(r.truncated).toBe(true);
    expect(r.result).toMatchObject({ grade: 0, completed: false });
  });
});
