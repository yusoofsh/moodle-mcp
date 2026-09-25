import { beforeEach, describe, it, expect, vi } from "vitest";
import type { MoodleClient } from "../src/moodle-client.js";
import { invokeReadOperation } from "../src/student/safe-api.js";
import { MoodleApiError } from "../src/moodle-errors.js";
import { readTasks } from "../src/student/insights.js";
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
                name: "Glossary",
                modname: "glossary",
                uservisible: true,
              },
              {
                id: 102,
                instance: 202,
                name: "Hidden",
                modname: "glossary",
                uservisible: false,
              },
            ],
          },
        ]
      : {},
  );
  client = {
    userId: 42,
    siteUrl: "https://moodle.example",
    profile: { functions: [] },
    supports: () => true,
    call,
  } as unknown as MoodleClient;
});
describe("reviewed additional API contracts", () => {
  it("injects a verified instance instead of accepting a raw caller override", async () => {
    await invokeReadOperation(client, "mod_glossary_get_entries_by_search", {
      courseId: 7,
      moduleId: 101,
      query: "aqidah",
      limit: 5,
    });
    expect(call).toHaveBeenLastCalledWith(
      "mod_glossary_get_entries_by_search",
      {
        id: 201,
        query: "aqidah",
        fullsearch: true,
        order: "CONCEPT",
        sort: "ASC",
        from: 0,
        limit: 5,
        "options[includenotapproved]": false,
      },
    );
    await expect(
      invokeReadOperation(client, "mod_glossary_get_entries_by_search", {
        courseId: 7,
        moduleId: 101,
        query: "a",
        _resolvedInstanceId: 999,
      }),
    ).rejects.toThrow();
  });
  it("rejects a wrong activity type before the specific API runs", async () => {
    await expect(
      invokeReadOperation(client, "mod_workshop_get_grades", {
        courseId: 7,
        moduleId: 101,
      }),
    ).rejects.toThrow(/type/);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("rejects a hidden module and never treats an instance ID as a module ID", async () => {
    await expect(
      invokeReadOperation(client, "mod_glossary_get_categories", {
        courseId: 7,
        moduleId: 102,
      }),
    ).rejects.toThrow(/visible/);
    await expect(
      invokeReadOperation(client, "mod_glossary_get_categories", {
        courseId: 7,
        moduleId: 201,
      }),
    ).rejects.toThrow(/visible/);
  });
  it("keeps Lesson attempt reads bound to the current student", async () => {
    call.mockImplementation(async (fn) =>
      fn === "core_course_get_contents"
        ? [
            {
              id: 1,
              name: "Week",
              modules: [
                {
                  id: 101,
                  instance: 201,
                  name: "Lesson",
                  modname: "lesson",
                  uservisible: true,
                },
              ],
            },
          ]
        : {},
    );
    await invokeReadOperation(client, "mod_lesson_get_user_attempt_grade", {
      courseId: 7,
      moduleId: 101,
      attempt: 0,
    });
    expect(call).toHaveBeenLastCalledWith("mod_lesson_get_user_attempt_grade", {
      lessonid: 201,
      lessonattempt: 0,
      userid: 42,
    });
  });
  it("does not turn a message filter into a mark-read action", async () => {
    await invokeReadOperation(client, "core_message_get_messages", {
      read: 0,
      limit: 5,
    });
    expect(call).toHaveBeenLastCalledWith("core_message_get_messages", {
      useridto: 42,
      useridfrom: 0,
      type: "both",
      read: 0,
      newestfirst: true,
      limitfrom: 0,
      limitnum: 5,
    });
    expect(call.mock.calls.some((c) => c[0].includes("mark"))).toBe(false);
  });
  it("restricts blog entries to the current author", async () => {
    await invokeReadOperation(client, "core_blog_get_entries", {
      page: 2,
      limit: 10,
    });
    expect(call).toHaveBeenLastCalledWith("core_blog_get_entries", {
      "filters[0][name]": "userid",
      "filters[0][value]": 42,
      page: 2,
      perpage: 10,
    });
  });
  it("retains a safe error code but does not echo sensitive diagnostics", async () => {
    call.mockRejectedValue(
      new MoodleApiError("invalidparameter", "SECRET token abc"),
    );
    const r = await invokeReadOperation(
      client,
      "core_message_get_conversations",
      {},
    );
    expect(r.warnings[0].upstreamCode).toBe("invalidparameter");
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("maps course competencies to the documented id parameter", async () => {
    await invokeReadOperation(
      client,
      "core_competency_list_course_competencies",
      { courseId: 7 },
    );
    expect(call).toHaveBeenLastCalledWith(
      "core_competency_list_course_competencies",
      { id: 7 },
    );
  });
  it("does not include future tasks outside the explicit lookahead", async () => {
    const now = 1800000000;
    call.mockImplementation(async (fn) =>
      fn === "core_course_get_contents"
        ? [
            {
              id: 1,
              name: "Week",
              modules: [
                {
                  id: 101,
                  instance: 201,
                  name: "Essay",
                  modname: "assign",
                  uservisible: true,
                },
              ],
            },
          ]
        : fn === "mod_assign_get_assignments"
          ? {
              courses: [
                {
                  id: 7,
                  assignments: [
                    {
                      id: 201,
                      cmid: 101,
                      course: 7,
                      name: "Essay",
                      duedate: now + 10 * 86400,
                      nosubmissions: 0,
                    },
                  ],
                },
              ],
            }
          : {
              lastattempt: {
                submission: { userid: 42, status: "draft" },
                submissionsenabled: true,
                extensionduedate: null,
              },
            },
    );
    const r = await readTasks(client, { courseId: 7, daysAhead: 3 }, now);
    expect(r.data.items).toEqual([]);
    expect(r.data.lookahead.outsideLookaheadInCheckedPage).toBe(1);
    expect(r.data.coverage.statusChecks).toBe(1);
  });
});
