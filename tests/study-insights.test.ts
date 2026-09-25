import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MoodleClient } from "../src/moodle-client.js";
import {
  readTasks,
  searchMaterials,
  readAssignmentDetails,
  readBriefing,
} from "../src/student/insights.js";
const now = 1800000000;
let client: MoodleClient,
  call: ReturnType<typeof vi.fn>,
  status: any,
  assignments: any[];
beforeEach(() => {
  assignments = [
    {
      id: 201,
      cmid: 101,
      course: 7,
      name: "Essay",
      duedate: now - 86400,
      nosubmissions: 0,
      grade: 100,
      intro: "<p>Write an essay about systems.</p>",
    },
  ];
  status = {
    lastattempt: {
      submission: { userid: 42, status: "draft" },
      graded: false,
      submissionsenabled: true,
      extensionduedate: null,
    },
  };
  call = vi.fn(async (fn: string, p: any) => {
    if (fn === "core_enrol_get_users_courses")
      return [{ id: 7, fullname: "Course", shortname: "C" }];
    if (fn === "core_course_get_contents")
      return [
        {
          id: 1,
          name: "Systems",
          modules: [
            {
              id: 101,
              instance: 201,
              name: "Essay",
              modname: "assign",
              uservisible: true,
              description: "<p>System design requirements</p>",
            },
            {
              id: 102,
              name: "Hidden",
              modname: "page",
              uservisible: false,
              description: "Hidden keyword",
            },
          ],
        },
      ];
    if (fn === "mod_assign_get_assignments")
      return { courses: [{ id: 7, assignments }], warnings: [] };
    if (fn === "mod_assign_get_submission_status") return status;
    if (fn === "gradereport_overview_get_course_grades")
      return { grades: [{ courseid: 7, grade: "0" }] };
    if (fn === "core_calendar_get_action_events_by_course") {
      expect(p.courseid).toBe(7);
      return { events: [], firstid: 0, lastid: 0 };
    }
    if (fn === "core_calendar_get_action_events_by_timesort")
      return { events: [], firstid: 0, lastid: 0 };
    throw new Error("Unexpected " + fn);
  });
  client = {
    userId: 42,
    siteUrl: "https://moodle.example",
    profile: { functions: [] },
    supports: () => true,
    call,
  } as unknown as MoodleClient;
});
describe("submission-aware tasks", () => {
  it("uses individual extensions instead of falsely reporting overdue", async () => {
    status.lastattempt.extensionduedate = now + 86400;
    const r = await readTasks(client, { courseId: 7 }, now);
    expect(r.data.items[0].state).toBe("due_soon");
    expect(r.data.items[0].effectiveDueDate).toBe(now + 86400);
  });
  it("does not report submitted or disabled assignments overdue", async () => {
    status.lastattempt.submission.status = "submitted";
    expect(
      (await readTasks(client, { courseId: 7 }, now)).data.items[0].state,
    ).toBe("submitted");
    assignments[0].nosubmissions = 1;
    expect(
      (await readTasks(client, { courseId: 7 }, now)).data.items[0].state,
    ).toBe("disabled");
  });
  it("unknown status remains unknown despite a past deadline", async () => {
    status = { warnings: [] };
    const r = await readTasks(client, { courseId: 7 }, now);
    expect(r.data.items[0].state).toBe("unknown");
    expect(r.data.counts.overdue).toBe(0);
  });
  it("does not assume no deadline when a date field is missing", async () => {
    delete assignments[0].duedate;
    expect(
      (await readTasks(client, { courseId: 7 }, now)).data.items[0].state,
    ).toBe("unknown");
    assignments[0].duedate = 0;
    expect(
      (await readTasks(client, { courseId: 7 }, now)).data.items[0].state,
    ).toBe("no_deadline");
  });
  it("supports team submission state and preserves zero grades separately", async () => {
    status.lastattempt.teamsubmission = {
      userid: 0,
      groupid: 5,
      status: "submitted",
    };
    const r = await readTasks(client, { courseId: 7 }, now);
    expect(r.data.items[0].state).toBe("submitted");
    expect(r.data.items[0].bridgeCanSubmit).toBe(false);
  });
  it("does not claim a nonzero page covers the entire account", async () => {
    const r = await readTasks(
      client,
      { courseId: 7, assignmentOffset: 1 },
      now,
    );
    expect(r.data.complete).toBe(false);
  });
});
describe("search and actual instruction bodies", () => {
  it("searches visible metadata without downloading every file or exposing hidden activities", async () => {
    const r = await searchMaterials(client, {
      courseId: 7,
      query: "system design",
    });
    expect(r.data.items.map((m) => m.cmid)).toEqual([101]);
    expect(call.mock.calls.map((c) => c[0])).toEqual([
      "core_course_get_contents",
    ]);
  });
  it("returns exact instructions rather than inventing requirement priorities", async () => {
    const r = await readAssignmentDetails(client, {
      courseId: 7,
      assignmentId: 201,
    });
    expect(r.data.instructions?.text).toContain(
      "Write an essay about systems.",
    );
    expect(r.data.requirementsInferred).toBe(false);
  });
  it("refuses another course or mismatched assignment/module identity", async () => {
    assignments[0].course = 99;
    await expect(
      readAssignmentDetails(client, { courseId: 7, assignmentId: 201 }),
    ).rejects.toThrow(/visible/);
  });
  it("briefing is read-only and includes explicit coverage and workload", async () => {
    const r = await readBriefing(client, { courseId: 7 });
    expect(r.data.tasks.coverage.statusChecks).toBe(1);
    expect(r.data.gradeOverview).toEqual({
      grades: [{ courseid: 7, grade: "0" }],
    });
    expect(
      call.mock.calls.some(
        (c) =>
          c[0] === "core_calendar_get_action_events_by_course" &&
          c[1]?.courseid === 7,
      ),
    ).toBe(true);
    expect(
      call.mock.calls.every(
        (c) => !/_view_|_mark_|_submit_|_save_|_start_/.test(c[0]),
      ),
    ).toBe(true);
  });
});
