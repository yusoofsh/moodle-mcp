import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { readCourses } from "../tools/courses.js";
import {
  loadSections,
  activityFor,
  summarizeActivities,
} from "./course-data.js";
import {
  idSchema,
  flagSchema,
  flag,
  unix,
  iso,
  packet,
  readApi,
  warning,
  type ReadWarning,
  type ReadState,
} from "./result.js";
import { readableContent, safeContentUrl } from "./content-text.js";

const eventSchema = z.object({
  id: idSchema,
  name: z.string(),
  courseid: z.number().int().optional(),
  course: z
    .object({
      id: idSchema,
      fullname: z.string().optional(),
      shortname: z.string().optional(),
    })
    .nullish(),
  timestart: z.number().int(),
  timesort: z.number().int().nullish(),
  timeduration: z.number().int().optional(),
  eventtype: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  action: z
    .object({
      name: z.string().optional(),
      itemcount: z.number().int().optional(),
      actionable: flagSchema.optional(),
      url: z.string().optional(),
    })
    .nullish(),
});
const eventsSchema = z.object({
  events: z.array(eventSchema),
  firstid: z.number().int().nullish(),
  lastid: z.number().int().nullish(),
});
const groupedEventsSchema = z.object({
  groupedbycourse: z.array(
    z.object({
      courseid: idSchema,
      events: z.array(eventSchema),
      firstid: z.number().int().nullish(),
      lastid: z.number().int().nullish(),
    }),
  ),
});
export interface CalendarOptions {
  courseId?: number;
  daysAhead?: number;
  lookbackDays?: number;
  limit?: number;
  afterEventId?: number;
  from?: number;
  to?: number;
}
export async function readCalendar(
  client: MoodleClient,
  options: CalendarOptions = {},
  now = Math.floor(Date.now() / 1000),
) {
  const days = options.daysAhead ?? 30,
    lookback = options.lookbackDays ?? 0,
    limit = options.limit ?? 50,
    after = options.afterEventId ?? 0;
  if (
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > 90 ||
    !Number.isSafeInteger(lookback) ||
    lookback < 0 ||
    lookback > 90 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(after) ||
    after < 0
  )
    throw new Error("Invalid calendar range or cursor");
  if (options.courseId !== undefined) idSchema.parse(options.courseId);
  const from = options.from ?? now - lookback * 86400,
    to = options.to ?? now + days * 86400;
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to <= from ||
    to - from > 180 * 86400
  )
    throw new Error("Calendar window must be a valid bounded range");
  // Course-specific pagination must happen at Moodle, not after a global limited page.
  const api =
    options.courseId === undefined
      ? "core_calendar_get_action_events_by_timesort"
      : "core_calendar_get_action_events_by_course";
  const params: Record<string, string | number | boolean> = {
    timesortfrom: from,
    timesortto: to,
    aftereventid: after,
    limitnum: limit,
  };
  if (options.courseId !== undefined) params.courseid = options.courseId;
  else {
    params.userid = client.userId;
    params.limittononsuspendedevents = true;
  }
  const primary = await readApi(client, api, params, eventsSchema);
  let raw = primary.value?.events ?? null,
    state = primary.state,
    fallbackUsed = false,
    fallbackMayHaveMore = false;
  const warnings = [...primary.warnings];

  // Some Moodle deployments advertise the per-user action endpoint but deny it
  // to ordinary students. Fall back to the grouped enrolled-course reader,
  // which still applies Moodle's own enrolment/visibility checks. This fallback
  // is intentionally unavailable for an afterEventId cursor because that API
  // has no equivalent cursor parameter.
  if (
    options.courseId === undefined &&
    after === 0 &&
    state !== "available" &&
    client.supports("core_calendar_get_action_events_by_courses")
  ) {
    const enrolled = await readCourses(client, { limit: 50 });
    warnings.push(...enrolled.warnings);
    const courseIds = enrolled.data.items?.map((c) => c.courseId) ?? null;
    if (courseIds !== null && courseIds.length > 0) {
      const perCourseLimit = Math.max(1, Math.floor(limit / courseIds.length));
      const groupedParams: Record<string, string | number | boolean> = {
        timesortfrom: from,
        timesortto: to,
        limitnum: perCourseLimit,
      };
      courseIds.forEach((courseId, index) => {
        groupedParams[`courseids[${index}]`] = courseId;
      });
      const fallback = await readApi(
        client,
        "core_calendar_get_action_events_by_courses",
        groupedParams,
        groupedEventsSchema,
      );
      warnings.push(...fallback.warnings);
      if (fallback.value) {
        const allowed = new Set(courseIds);
        const groups = fallback.value.groupedbycourse.filter((group) =>
          allowed.has(group.courseid),
        );
        if (groups.length !== fallback.value.groupedbycourse.length)
          warnings.push(
            warning(
              "EVENT_CONTEXT_MISMATCH",
              "Events for courses outside the authenticated enrolment list were withheld.",
              "core_calendar_get_action_events_by_courses",
            ),
          );
        const groupedEvents = groups.flatMap((group) =>
          group.events
            .filter(
              (event) =>
                (event.course?.id ?? event.courseid ?? group.courseid) ===
                group.courseid,
            )
            .map((event) => ({
              ...event,
              courseid: event.courseid ?? group.courseid,
            })),
        );
        groupedEvents.sort(
          (a, b) =>
            (a.timesort ?? a.timestart) - (b.timesort ?? b.timestart) ||
            a.id - b.id,
        );
        fallbackMayHaveMore =
          enrolled.pagination?.nextOffset !== null ||
          groups.some((group) => group.events.length >= perCourseLimit) ||
          groupedEvents.length > limit;
        raw = groupedEvents.slice(0, limit);
        state = fallback.state;
        fallbackUsed = true;
        warnings.push(
          warning(
            "CALENDAR_GROUPED_FALLBACK",
            "The per-user action endpoint was unavailable, so the timeline used bounded action events from the authenticated student's enrolled courses. User/site events may be absent.",
            "core_calendar_get_action_events_by_courses",
          ),
        );
      }
    }
  }

  const filtered =
    raw?.filter(
      (e) =>
        options.courseId === undefined ||
        (e.course?.id ?? e.courseid) === options.courseId,
    ) ?? null;
  if (raw && filtered && raw.length !== filtered.length)
    warnings.push(
      warning(
        "EVENT_CONTEXT_MISMATCH",
        "Events outside the requested course were withheld.",
        api,
      ),
    );
  const items =
    filtered?.map((e) => ({
      eventId: e.id,
      courseId: e.course?.id ?? e.courseid ?? null,
      courseName: e.course?.fullname ?? e.course?.shortname ?? null,
      name: e.name,
      eventType: e.eventtype ?? null,
      startDate: unix(e.timestart),
      startDateIso: iso(e.timestart),
      sortDate: unix(e.timesort ?? e.timestart),
      sortDateIso: iso(e.timesort ?? e.timestart),
      durationSeconds: e.timeduration ?? null,
      timing: (e.timesort ?? e.timestart) < now ? "past" : "upcoming",
      isDeadline: ["due", "close"].includes(e.eventtype ?? ""),
      url: safeContentUrl(e.action?.url ?? e.url ?? "", client.siteUrl),
      description:
        e.description === undefined
          ? null
          : readableContent(e.description, 1, client.siteUrl, 2000),
      action: e.action
        ? {
            name: e.action.name ?? null,
            itemCount: e.action.itemcount ?? null,
            actionable: flag(e.action.actionable),
          }
        : null,
    })) ?? null;
  const last = fallbackUsed
    ? null
    : (primary.value?.lastid ?? raw?.at(-1)?.id ?? null);
  const mayHaveMore =
    raw === null
      ? null
      : fallbackUsed
        ? fallbackMayHaveMore
        : raw.length >= limit;
  const data = {
    userId: client.userId,
    courseId: options.courseId ?? null,
    from,
    to,
    fromIso: iso(from),
    toIso: iso(to),
    items,
    cursor: {
      mode: "upstream_event" as const,
      afterEventId: fallbackUsed ? null : mayHaveMore ? last : null,
      mayHaveMore,
      limit,
    },
    complete:
      !fallbackUsed &&
      after === 0 &&
      state === "available" &&
      mayHaveMore === false &&
      warnings.length === 0,
    scope: fallbackUsed
      ? "Bounded enrolled-course action-event fallback. User/site events may be absent and grouped results have no afterEventId cursor."
      : "Moodle action events, not the full personal/group/site calendar. A past opening event is not an overdue submission.",
  };
  return packet(
    data,
    `## Action timeline\n` +
      (items === null
        ? "Timeline unavailable (" + state + "); not proof of no deadlines."
        : items
            .map(
              (e) =>
                `- ${e.name} — ${e.startDateIso ?? "date unknown"} (${e.eventType ?? "unknown"}, ${e.timing})`,
            )
            .join("\n")),
    { calendar: state },
    warnings,
  );
}
export interface DashboardOptions {
  courseOffset?: number;
  maxCourses?: number;
  daysAhead?: number;
  lookbackDays?: number;
  eventLimit?: number;
  afterEventId?: number;
}
export async function readDashboard(
  client: MoodleClient,
  options: DashboardOptions = {},
) {
  const max = options.maxCourses ?? 3,
    offset = options.courseOffset ?? 0;
  if (
    !Number.isSafeInteger(max) ||
    max < 1 ||
    max > 5 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw new Error(
      "Dashboard must request 1 to 5 courses at a nonnegative offset",
    );
  const generatedAt = Math.floor(Date.now() / 1000),
    deadline = Date.now() + 20000;
  const enrolled = await readCourses(client, { offset, limit: max });
  const warnings: ReadWarning[] = [...enrolled.warnings];
  const courses: DashboardCourse[] | null = enrolled.data.items ? [] : null;
  for (const c of enrolled.data.items ?? []) {
    let progress: ReturnType<typeof summarizeActivities> | null = null,
      readStatus: ReadState = "unavailable",
      attendanceActivityCount: number | null = null;
    if (Date.now() > deadline)
      warnings.push(
        warning(
          "DASHBOARD_TIME_BUDGET",
          "Remaining course summaries were skipped to bound request duration; request the next course page.",
        ),
      );
    else
      try {
        const loaded = await loadSections(client, c.courseId);
        warnings.push(...loaded.warnings);
        const activities = loaded.sections.flatMap((s) =>
          s.modules.map((m) => activityFor(client, c.courseId, s, m)),
        );
        progress = summarizeActivities(activities);
        attendanceActivityCount = activities.filter(
          (m) => m.moduleType === "attendance",
        ).length;
        readStatus = "available";
      } catch {
        warnings.push(
          warning(
            "COURSE_PROGRESS_UNAVAILABLE",
            "Progress for course " +
              c.courseId +
              " could not be read; no zero or completion decision was inferred.",
          ),
        );
      }
    courses!.push({
      courseId: c.courseId,
      name: c.name,
      url: c.url,
      reportedCourseCompleted: c.completed,
      reportedProgressPercent: c.progressPercent,
      readStatus,
      activityProgress: progress,
      attendanceActivityCount,
    });
  }
  const timeline = await readCalendar(
    client,
    {
      daysAhead: options.daysAhead,
      lookbackDays: options.lookbackDays ?? 7,
      limit: options.eventLimit ?? 30,
      afterEventId: options.afterEventId,
    },
    generatedAt,
  );
  warnings.push(...timeline.warnings);
  const complete =
    offset === 0 &&
    enrolled.capabilities.courses === "available" &&
    enrolled.pagination?.nextOffset === null &&
    courses !== null &&
    courses.every((c) => c.readStatus === "available") &&
    timeline.data.complete &&
    warnings.length === 0;
  return packet(
    {
      userId: client.userId,
      generatedAt,
      generatedAtIso: iso(generatedAt),
      courses,
      timeline: timeline.data,
      complete,
      coverage: {
        coursePage: enrolled.pagination,
        progressBasis:
          "Visible activity completion from course contents; separate from Moodle course-completion criteria.",
        timelineScope:
          "All current-user actionable events in the requested window, independent of the course-summary page.",
        submissionStatesFetched: false,
        maximumCourseReads: max,
      },
    },
    `## Student dashboard\n` +
      (courses ?? [])
        .map(
          (c) =>
            `- ${c.name}: ${c.activityProgress?.percentComplete ?? "unknown"}% visible-activity completion (${c.readStatus})`,
        )
        .join("\n") +
      "\n" +
      timeline.text,
    {
      courses: enrolled.capabilities.courses,
      calendar: timeline.capabilities.calendar,
    },
    warnings,
    enrolled.pagination,
  );
}
interface DashboardCourse {
  courseId: number;
  name: string;
  url: string;
  reportedCourseCompleted: boolean | null;
  reportedProgressPercent: number | null;
  readStatus: ReadState;
  activityProgress: ReturnType<typeof summarizeActivities> | null;
  attendanceActivityCount: number | null;
}
