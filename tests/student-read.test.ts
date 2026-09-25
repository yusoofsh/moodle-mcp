import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAssignments,
  readAssignmentStatus,
} from "../src/student/assignments.js";
import {
  readActivityCompletion,
  readCourseCompletion,
} from "../src/student/completion.js";
import { readAttendance } from "../src/student/attendance.js";
import type { MoodleClient } from "../src/moodle-client.js";
import { MoodleApiError } from "../src/moodle-errors.js";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { registerAllTools } from "../src/register-tools.js";

const site = "https://moodle.example/learn",
  userId = 42,
  courseId = 7;
let sections: any[],
  assignments: any,
  completion: any,
  courseCompletion: any,
  submission: any,
  sessions: any[];
let call: ReturnType<typeof vi.fn>, client: MoodleClient, denied: Set<string>;
const connections: { s: McpServer; c: Client }[] = [];
beforeEach(() => {
  denied = new Set();
  sections = [
    {
      id: 1,
      name: "Week 1",
      modules: [
        {
          id: 101,
          instance: 201,
          modname: "assign",
          name: "Essay",
          uservisible: true,
          completion: 2,
          completiondata: { state: 0, istrackeduser: true },
        },
        {
          id: 102,
          instance: 202,
          modname: "attendance",
          name: "Class attendance",
          uservisible: true,
          completion: 1,
          completiondata: {
            state: 3,
            isoverallcomplete: false,
            istrackeduser: true,
          },
        },
        {
          id: 103,
          instance: 203,
          modname: "page",
          name: "Reading",
          uservisible: true,
          completion: 0,
        },
        { id: 104, modname: "assign", name: "Hidden", uservisible: false },
      ],
    },
  ];
  assignments = {
    courses: [
      {
        id: 99,
        assignments: [
          { id: 666, cmid: 101, course: 99, name: "Other course", duedate: 1 },
        ],
      },
      {
        id: 7,
        assignments: [
          {
            id: 201,
            cmid: 101,
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
  };
  completion = {
    statuses: [
      {
        cmid: 101,
        instance: 201,
        modname: "assign",
        tracking: 2,
        state: 2,
        timecompleted: 1790000000,
        istrackeduser: true,
        isoverallcomplete: true,
      },
      {
        cmid: 102,
        instance: 202,
        modname: "attendance",
        tracking: 1,
        state: 3,
        timecompleted: 1790000000,
        istrackeduser: true,
        isoverallcomplete: false,
      },
      {
        cmid: 999,
        instance: 999,
        modname: "page",
        tracking: 1,
        state: 1,
        timecompleted: 1,
      },
    ],
    warnings: [],
  };
  courseCompletion = {
    completionstatus: {
      completed: false,
      aggregation: 1,
      completions: [
        {
          type: 4,
          title: "Activities",
          status: "1/2",
          complete: false,
          timecompleted: 0,
          details: {
            type: "Activity",
            criteria: "Finish learning",
            requirement: "All",
            status: "1/2",
          },
        },
      ],
    },
    warnings: [],
  };
  submission = {
    lastattempt: {
      submission: {
        id: 11,
        userid: 42,
        status: "submitted",
        timemodified: 1790000000,
        attemptnumber: 0,
      },
      graded: true,
      submissionsenabled: true,
      locked: false,
      canedit: false,
      cansubmit: false,
      extensionduedate: 1800200000,
      gradingstatus: "graded",
    },
    feedback: {
      gradefordisplay: "0 / 100",
      gradeddate: 1790000001,
      grade: { grade: "0.00000" },
    },
    warnings: [],
  };
  sessions = [
    {
      id: 301,
      attendanceid: 202,
      courseid: 7,
      sessdate: 1790000000,
      duration: 3600,
      description: "Class",
      studentscanmark: 1,
      autoassignstatus: 1,
      statuses: [
        {
          id: 11,
          description: "Present",
          acronym: "P",
          grade: 2,
          visible: 1,
          deleted: 0,
        },
      ],
      attendance_log: [
        { studentid: 42, statusid: "11", remarks: "On time" },
        { studentid: 999, statusid: "11", remarks: "SECRET-OTHER-STUDENT" },
      ],
      users: [
        { id: 42, firstname: "Self" },
        { id: 999, firstname: "SECRET-OTHER-STUDENT" },
      ],
    },
  ];
  call = vi.fn(async (fn: string) => {
    if (fn === "core_course_get_contents") return sections;
    if (fn === "mod_assign_get_assignments") return assignments;
    if (fn === "mod_assign_get_submission_status") return submission;
    if (fn === "core_completion_get_activities_completion_status")
      return completion;
    if (fn === "core_completion_get_course_completion_status")
      return courseCompletion;
    if (fn === "mod_attendance_get_sessions") return sessions;
    if (fn === "core_course_get_course_module")
      return {
        cm: { id: 102, course: 7, instance: 202, modname: "attendance" },
      };
    throw new Error("Forbidden test API " + fn);
  });
  client = {
    siteUrl: site,
    userId,
    siteName: "Example",
    release: "4.5.6+",
    profile: { functions: [] },
    supportedFunctions: new Set(),
    supports: (fn: string) => !denied.has(fn),
    call,
  } as unknown as MoodleClient;
});
afterEach(async () => {
  for (const { s, c } of connections.splice(0)) {
    await c.close();
    await s.close();
  }
  vi.restoreAllMocks();
});
async function mcp() {
  const s = new McpServer({ name: "test", version: "1" });
  registerAllTools(s, async () => client);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "test", version: "1" });
  connections.push({ s, c });
  await s.connect(st);
  await c.connect(ct);
  return c;
}

describe("Moodle 4.5 assignment contract", () => {
  it("joins cmid in the requested course, not first course or coursemodule", async () => {
    const r = await readAssignments(client, 7);
    expect(r.data.items).toHaveLength(1);
    expect(r.data.items[0]).toMatchObject({
      courseId: 7,
      cmid: 101,
      assignmentId: 201,
      instanceId: 201,
      detailsStatus: "available",
      dueDate: 1800000000,
      dueDateIso: "2027-01-15T08:00:00.000Z",
    });
    expect(r.text).toContain("Essay");
    expect(r.text).not.toContain("details unavailable");
  });
  it("never supplies false assignment details for mismatched instance or course", async () => {
    assignments.courses[1].assignments[0].id = 999;
    const r = await readAssignments(client, 7);
    expect(r.data.items[0].assignmentId).toBeNull();
    expect(r.data.items[0].dueDate).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("does not default missing due date or missing detail to no due date", async () => {
    delete assignments.courses[1].assignments[0].duedate;
    expect((await readAssignments(client, 7)).data.items[0].dueDateState).toBe(
      "unknown",
    );
    assignments.courses[1].assignments[0].duedate = 0;
    expect((await readAssignments(client, 7)).data.items[0].dueDateState).toBe(
      "none",
    );
  });
  it("handles warning/omitted API data without false empty success", async () => {
    assignments = {
      courses: [],
      warnings: [
        { item: "course", itemid: 7, warningcode: "2", message: "SECRET" },
      ],
    };
    const r = await readAssignments(client, 7);
    expect(r.data.items[0].detailsStatus).not.toBe("available");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("labels missing API and retains accessible assignment activity inventory", async () => {
    denied.add("mod_assign_get_assignments");
    const r = await readAssignments(client, 7);
    expect(r.capabilities.assignments).toBe("not_advertised");
    expect(r.data.items[0].assignmentId).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("honors hidden sections and numeric false without treating visible=0 as permission", async () => {
    sections[0].modules[0].uservisible = 0;
    expect((await readAssignments(client, 7)).data.items).toHaveLength(0);
    sections[0].uservisible = false;
    expect((await readAssignments(client, 7)).data.items).toHaveLength(0);
  });
  it("maps self submission and preserves grade zero, extension, and explicit booleans", async () => {
    const r = await readAssignmentStatus(client, 201);
    expect(call).toHaveBeenCalledWith("mod_assign_get_submission_status", {
      assignid: 201,
      userid: 42,
    });
    expect(r.data).toMatchObject({
      assignmentId: 201,
      userId: 42,
      submissionStatus: "submitted",
      graded: true,
      extensionDueDate: 1800200000,
      feedback: { grade: "0.00000" },
    });
  });
  it("missing lastattempt is unknown, never Not submitted or ungraded", async () => {
    submission = { warnings: [] };
    const r = await readAssignmentStatus(client, 201);
    expect(r.data.submissionStatus).toBe("unknown");
    expect(r.data.graded).toBeNull();
    expect(r.text).not.toContain("Not submitted");
  });
  it("supports team submissions without claiming individual new means not submitted", async () => {
    submission.lastattempt.submission.status = "new";
    submission.lastattempt.teamsubmission = {
      id: 12,
      userid: 0,
      groupid: 4,
      status: "submitted",
      timemodified: 1790000000,
    };
    expect((await readAssignmentStatus(client, 201)).data).toMatchObject({
      submissionStatus: "submitted",
      submissionKind: "team",
    });
  });
  it("omits another users submission", async () => {
    submission.lastattempt.submission.userid = 999;
    submission.lastattempt.submission.status = "PRIVATE-OTHER";
    const r = await readAssignmentStatus(client, 201);
    expect(r.data.submissionStatus).toBe("unknown");
    expect(r.data.graded).toBeNull();
    expect(r.data.feedback).toBeNull();
    expect(JSON.stringify(r)).not.toContain("PRIVATE-OTHER");
  });
});
describe("student-only completion", () => {
  it("uses self identity and current visibility; explicit failed completion is not a pass", async () => {
    const r = await readActivityCompletion(client, 7);
    expect(call).toHaveBeenCalledWith(
      "core_completion_get_activities_completion_status",
      { courseid: 7, userid: 42 },
    );
    expect(r.data.items.map((m: any) => m.cmid)).toEqual([101, 102, 103]);
    expect(r.data.summary).toMatchObject({
      tracked: 2,
      completed: 1,
      incomplete: 1,
      failed: 1,
      percentComplete: 50,
    });
    expect(r.data.items[1].completion.status).toBe("complete_fail");
  });
  it("falls back to permission-filtered course contents with an explicit source", async () => {
    denied.add("core_completion_get_activities_completion_status");
    const r = await readActivityCompletion(client, 7);
    expect(r.data.items[0].completion.source).toBe("core_course_get_contents");
    expect(r.capabilities.activityCompletion).toBe("not_advertised");
  });
  it("missing tracking or completion state is unknown, not zero percent", async () => {
    completion = { statuses: [], warnings: [] };
    delete sections[0].modules[0].completiondata;
    delete sections[0].modules[1].completion;
    delete sections[0].modules[1].completiondata;
    const r = await readActivityCompletion(client, 7);
    expect(r.data.summary.percentComplete).toBeNull();
    expect(r.data.items[0].completion.status).toBe("unknown");
  });
  it("course completion is separate from activity percentages and has own criteria", async () => {
    const r = await readCourseCompletion(client, 7);
    expect(r.data.completed).toBe(false);
    expect(r.data.criteria[0].completed).toBe(false);
    expect(call).toHaveBeenCalledWith(
      "core_completion_get_course_completion_status",
      { courseid: 7, userid: 42 },
    );
  });
  it.each([
    ["nocriteriaset", "not_configured"],
    ["completionnotenabled", "not_configured"],
    ["cannotviewreport", "forbidden"],
    ["invalidtoken", "unauthenticated"],
  ])("distinguishes %s from incomplete", async (code, state) => {
    call.mockImplementation(async (fn) => {
      if (fn === "core_course_get_contents") return sections;
      throw new MoodleApiError(code, "SECRET");
    });
    const r = await readCourseCompletion(client, 7);
    expect(r.capabilities.courseCompletion).toBe(state);
    expect(r.data.completed).toBeNull();
    expect(r.data.criteria).toBeNull();
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("pagination bounds output and reports remaining items honestly", async () => {
    const r = await readActivityCompletion(client, 7, { offset: 1, limit: 1 });
    expect(r.data.items).toHaveLength(1);
    expect(r.pagination).toMatchObject({
      offset: 1,
      limit: 1,
      total: 3,
      nextOffset: 2,
      mode: "local",
    });
    expect(r.data.summary.tracked).toBe(2);
  });
});
describe("Attendance is never a marking workflow", () => {
  it("lists accessible modules without invoking mobile handlers or session APIs", async () => {
    const r = await readAttendance(client, 7);
    expect(r.data.activities).toHaveLength(1);
    expect(r.data.sessions).toBeNull();
    expect(call.mock.calls.map((c) => c[0])).toEqual([
      "core_course_get_contents",
    ]);
  });
  it("reads a selected permitted instance and exposes only the current students log", async () => {
    const r = await readAttendance(client, 7, 102);
    expect(call).toHaveBeenCalledWith("mod_attendance_get_sessions", {
      attendanceid: 202,
    });
    expect(r.data.sessions![0]).toMatchObject({
      sessionId: 301,
      status: "recorded",
      statusLabel: "Present",
      remarks: "On time",
    });
    expect(JSON.stringify(r)).not.toContain("SECRET-OTHER-STUDENT");
    expect(JSON.stringify(call.mock.calls)).not.toContain(
      "tool_mobile_get_content",
    );
  });
  it("does not equate completion with attendance and does not invent absent sessions", async () => {
    denied.add("mod_attendance_get_sessions");
    const r = await readAttendance(client, 7, 102);
    expect(r.capabilities.attendanceSessions).toBe("not_advertised");
    expect(r.data.sessions).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.text).not.toMatch(/Status: Absent/i);
  });
  it("permission denial does not trigger a mobile fallback", async () => {
    call.mockImplementation(async (fn) => {
      if (fn === "core_course_get_contents") return sections;
      throw new MoodleApiError("nopermissions", "SECRET");
    });
    const r = await readAttendance(client, 7, 102);
    expect(r.capabilities.attendanceSessions).toBe("forbidden");
    expect(r.data.sessions).toBeNull();
    expect(call).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("treats the plugin ambiguous invalidparameter as unavailable rather than pretending absence", async () => {
    call.mockImplementation(async (fn) => {
      if (fn === "core_course_get_contents") return sections;
      throw new MoodleApiError(
        "invalidparameter",
        "Invalid session id or no permissions.",
      );
    });
    expect(
      (await readAttendance(client, 7, 102)).capabilities.attendanceSessions,
    ).toBe("unavailable");
  });
  it("rejects hidden/non-Attendance module and mismatched session ownership", async () => {
    await expect(readAttendance(client, 7, 101)).rejects.toThrow(/Attendance/);
    sessions[0].courseid = 999;
    const r = await readAttendance(client, 7, 102);
    expect(r.data.sessions).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("missing self in a session is unknown, not absent or not recorded", async () => {
    sessions[0].attendance_log = [];
    sessions[0].users = [{ id: 999 }];
    const r = await readAttendance(client, 7, 102);
    expect(r.data.sessions![0].status).toBe("unknown");
  });
});
describe("MCP data contract and scope", () => {
  it("returns equivalent structured and JSON text data", async () => {
    const c = await mcp();
    const r = await c.callTool({
      name: "moodle_list_assignments",
      arguments: { courseId: 7 },
    });
    expect(r.isError).not.toBe(true);
    expect(r.structuredContent).toMatchObject({
      schemaVersion: 1,
      data: { courseId: 7 },
      text: expect.any(String),
    });
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual(
      r.structuredContent,
    );
  });
  it.each([
    "moodle_get_activity_completion",
    "moodle_get_course_completion",
    "moodle_get_attendance",
  ])(
    "rejects another userId and malformed IDs before upstream: %s",
    async (name) => {
      const c = await mcp();
      for (const args of [{ courseId: -1 }, { courseId: 7, userId: 999 }]) {
        const r = await c.callTool({ name, arguments: args });
        expect(r.isError).toBe(true);
      }
      expect(call).not.toHaveBeenCalled();
    },
  );
});

describe("read-contract edge cases and catalog alignment", () => {
  it("keeps zero grade separate from missing, and a negative grade as a scale ID", async () => {
    assignments.courses[1].assignments[0].grade = -4;
    expect(
      (await readAssignments(client, 7)).data.items[0].grade,
    ).toMatchObject({ type: "scale", scaleId: 4, maximum: null });
    assignments.courses[1].assignments[0].grade = 0;
    expect((await readAssignments(client, 7)).data.items[0].grade?.type).toBe(
      "none",
    );
  });
  it("refuses ambiguous duplicate assignment records without picking the first", async () => {
    assignments.courses[1].assignments.push({
      ...assignments.courses[1].assignments[0],
    });
    expect((await readAssignments(client, 7)).data.items[0].detailsStatus).toBe(
      "not_returned",
    );
  });
  it("does not convert untracked users or disabled activity completion into incomplete", async () => {
    completion.statuses[0].hascompletion = false;
    completion.statuses[1].istrackeduser = false;
    const r = await readActivityCompletion(client, 7);
    expect(r.data.items[0].completion.status).toBe("not_tracked");
    expect(r.data.items[1].completion.completed).toBeNull();
  });
  it("unknown schemas and raw errors do not escape or silently become empty data", async () => {
    courseCompletion = { completionstatus: "unexpected PRIVATE" };
    const r = await readCourseCompletion(client, 7);
    expect(r.data.completed).toBeNull();
    expect(r.capabilities.courseCompletion).toBe("invalid_response");
    expect(JSON.stringify(r)).not.toContain("PRIVATE");
  });
  it("uses module lookup only when instance is missing and verifies the context", async () => {
    delete sections[0].modules[1].instance;
    const r = await readAttendance(client, 7, 102);
    expect(r.data.sessions![0].instanceId).toBe(202);
    expect(call.mock.calls.map((c) => c[0])).toEqual([
      "core_course_get_contents",
      "core_course_get_course_module",
      "mod_attendance_get_sessions",
    ]);
  });
  it("new student tools never expose a mark, submit, QR or other-user argument", async () => {
    const c = await mcp();
    const list = await c.listTools();
    for (const name of [
      "moodle_get_activity_completion",
      "moodle_get_course_completion",
      "moodle_get_attendance",
    ]) {
      const tool = list.tools.find((t) => t.name === name)!;
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toEqual(
        expect.arrayContaining(["userId"]),
      );
    }
  });
});
