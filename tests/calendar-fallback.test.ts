import { describe, expect, it, vi } from "vitest";
import type { MoodleClient } from "../src/moodle-client.js";
import { readCalendar } from "../src/student/dashboard.js";

const now = 1790366600;

function clientWithDeniedGlobalActionEndpoint() {
  const call = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    if (fn === "core_enrol_get_users_courses")
      return [
        { id: 7, fullname: "Course A", shortname: "A" },
        { id: 8, fullname: "Course B", shortname: "B" },
      ];
    if (fn === "core_calendar_get_action_events_by_courses") {
      expect(params).toMatchObject({
        "courseids[0]": 7,
        "courseids[1]": 8,
        limitnum: 25,
      });
      return {
        groupedbycourse: [
          {
            courseid: 7,
            events: [
              {
                id: 701,
                name: "Assignment due",
                course: { id: 7, fullname: "Course A" },
                eventtype: "due",
                timestart: now + 3600,
                timesort: now + 3600,
              },
            ],
            firstid: 701,
            lastid: 701,
          },
          {
            courseid: 8,
            events: [
              {
                id: 801,
                name: "Quiz opens",
                courseid: 8,
                eventtype: "open",
                timestart: now + 7200,
                timesort: now + 7200,
              },
            ],
            firstid: 801,
            lastid: 801,
          },
        ],
      };
    }
    throw new Error("Unexpected API " + fn);
  });
  const client = {
    userId: 42,
    siteUrl: "https://moodle.example",
    profile: { functions: [] },
    supports: (fn: string) =>
      fn !== "core_calendar_get_action_events_by_timesort",
    call,
  } as unknown as MoodleClient;
  return { client, call };
}

describe("lightweight calendar fallback", () => {
  it("uses bounded grouped events from current enrolments when the per-user action endpoint is unavailable", async () => {
    const { client, call } = clientWithDeniedGlobalActionEndpoint();
    const result = await readCalendar(
      client,
      { daysAhead: 14, lookbackDays: 7, limit: 50 },
      now,
    );

    expect(result.capabilities.calendar).toBe("available");
    expect(result.data.items?.map((event) => event.eventId)).toEqual([
      701, 801,
    ]);
    expect(result.data.items?.map((event) => event.courseId)).toEqual([7, 8]);
    expect(result.data.cursor.afterEventId).toBeNull();
    expect(result.data.complete).toBe(false);
    expect(result.data.scope).toMatch(/fallback/i);
    expect(
      result.warnings.some((w) => w.code === "CALENDAR_GROUPED_FALLBACK"),
    ).toBe(true);
    expect(call.mock.calls.map((entry) => entry[0])).toEqual([
      "core_enrol_get_users_courses",
      "core_calendar_get_action_events_by_courses",
    ]);
  });

  it("does not fake cursor continuation with an API that has no afterEventId parameter", async () => {
    const { client, call } = clientWithDeniedGlobalActionEndpoint();
    const result = await readCalendar(
      client,
      { afterEventId: 99, daysAhead: 14 },
      now,
    );

    expect(result.data.items).toBeNull();
    expect(result.capabilities.calendar).toBe("not_advertised");
    expect(call).not.toHaveBeenCalled();
  });
});
