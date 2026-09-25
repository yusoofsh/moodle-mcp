import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { readAssignments, readAssignmentStatus } from "./assignments.js";
import { readCourses } from "../tools/courses.js";
import { loadSections } from "./course-data.js";
import { readCalendar } from "./dashboard.js";
import { readableContent } from "./content-text.js";
import { invokeReadOperation } from "./safe-api.js";
import {
  idSchema,
  packet,
  readApi,
  warning,
  iso,
  type ReadWarning,
  type ReadState,
} from "./result.js";

export const courseWindow = {
  courseId: idSchema.optional(),
  courseOffset: z.number().int().min(0).max(100000).optional(),
  maxCourses: z.number().int().min(1).max(5).optional(),
};
export const taskInput = z
  .object({
    ...courseWindow,
    assignmentOffset: z.number().int().min(0).max(100000).optional(),
    limit: z.number().int().min(1).max(20).optional(),
    daysAhead: z.number().int().min(1).max(90).optional(),
  })
  .strict();
export const searchInput = z
  .object({
    ...courseWindow,
    query: z.string().trim().min(1).max(200),
    offset: z.number().int().min(0).max(100000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const briefInput = z
  .object({
    ...taskInput.shape,
    period: z.enum(["daily", "weekly"]).optional(),
  })
  .strict();
export const changesInput = z
  .object({ ...courseWindow, since: z.number().int().min(0).optional() })
  .strict();
type CourseWindow = {
  courseId?: number;
  courseOffset?: number;
  maxCourses?: number;
};
export async function selectedCourses(
  client: MoodleClient,
  options: CourseWindow,
) {
  if (options.courseId !== undefined) {
    idSchema.parse(options.courseId);
    return {
      items: [
        { courseId: options.courseId, name: "Course " + options.courseId },
      ],
      nextCourseOffset: null as number | null,
      warnings: [] as ReadWarning[],
      state: "available" as ReadState,
    };
  }
  const result = await readCourses(client, {
    offset: options.courseOffset ?? 0,
    limit: options.maxCourses ?? 3,
  });
  return {
    items:
      result.data.items?.map((c) => ({ courseId: c.courseId, name: c.name })) ??
      null,
    nextCourseOffset: result.pagination?.nextOffset ?? null,
    warnings: result.warnings,
    state: result.capabilities.courses,
  };
}
export type TaskState =
  | "overdue"
  | "due_soon"
  | "upcoming"
  | "no_deadline"
  | "submitted"
  | "disabled"
  | "unknown"
  | "not_checked";
export interface StudyTask {
  courseId: number;
  courseName: string;
  assignmentId: number | null;
  cmid: number;
  name: string;
  url: string;
  baseDueDate: number | null;
  effectiveDueDate: number | null;
  effectiveDueDateIso: string | null;
  extensionDueDate: number | null;
  submissionStatus: string;
  state: TaskState;
  graded: boolean | null;
  canSubmitInMoodle: boolean | null;
  bridgeCanSubmit: false;
}

export async function readTasks(
  client: MoodleClient,
  raw: z.infer<typeof taskInput> = {},
  now = Math.floor(Date.now() / 1000),
) {
  const options = taskInput.parse(raw),
    courses = await selectedCourses(client, options),
    warnings = [...courses.warnings];
  const all: {
    courseName: string;
    row: Awaited<ReturnType<typeof readAssignments>>["data"]["items"][number];
  }[] = [];
  let listingsComplete = courses.items !== null;
  for (const course of courses.items ?? []) {
    try {
      const list = await readAssignments(client, course.courseId, {
        limit: 250,
      });
      warnings.push(...list.warnings);
      if (
        list.pagination?.nextOffset !== null ||
        list.capabilities.assignments !== "available"
      )
        listingsComplete = false;
      for (const row of list.data.items)
        all.push({ courseName: course.name, row });
    } catch {
      listingsComplete = false;
      warnings.push(
        warning(
          "ASSIGNMENTS_UNAVAILABLE",
          "Assignment inventory for course " +
            course.courseId +
            " could not be read; no empty-course assumption was made.",
        ),
      );
    }
  }
  all.sort(
    (a, b) => a.row.courseId - b.row.courseId || a.row.cmid - b.row.cmid,
  );
  const offset = options.assignmentOffset ?? 0,
    limit = options.limit ?? 10,
    selected = all.slice(offset, offset + limit),
    deadline = Date.now() + 20000;
  const tasks: StudyTask[] = [];
  let examined = 0,
    checked = 0;
  for (const { row, courseName } of selected) {
    const task: StudyTask = {
      courseId: row.courseId,
      courseName,
      assignmentId: row.assignmentId,
      cmid: row.cmid,
      name: row.name,
      url: row.url,
      baseDueDate: row.dueDate,
      effectiveDueDate: row.dueDate,
      effectiveDueDateIso: iso(row.dueDate),
      extensionDueDate: null,
      submissionStatus: "unknown",
      state: "not_checked",
      graded: null,
      canSubmitInMoodle: null,
      bridgeCanSubmit: false,
    };
    if (Date.now() > deadline) {
      tasks.push(task);
      continue;
    }
    examined++;
    if (row.detailsStatus !== "available" || row.assignmentId === null) {
      task.state = "unknown";
      tasks.push(task);
      continue;
    }
    if (row.submissionsEnabled === false) {
      task.state = "disabled";
      task.submissionStatus = "disabled";
      tasks.push(task);
      continue;
    }
    const status = await readAssignmentStatus(client, row.assignmentId);
    checked++;
    warnings.push(...status.warnings);
    const value = status.data;
    task.submissionStatus = value.submissionStatus;
    task.graded = value.graded;
    task.canSubmitInMoodle = value.canSubmitInMoodle;
    task.extensionDueDate = value.extensionDueDate;
    task.effectiveDueDate =
      value.extensionDueDate === null
        ? row.dueDate
        : Math.max(row.dueDate ?? 0, value.extensionDueDate);
    task.effectiveDueDateIso = iso(task.effectiveDueDate);
    if (
      status.capabilities.submissionStatus !== "available" ||
      value.submissionStatus === "unknown"
    )
      task.state = "unknown";
    else if (value.submissionStatus === "submitted") task.state = "submitted";
    else if (value.submissionStatus === "disabled") task.state = "disabled";
    else if (
      !["not_submitted", "draft", "reopened"].includes(value.submissionStatus)
    )
      task.state = "unknown";
    else if (task.effectiveDueDate === null)
      task.state = row.dueDateState === "none" ? "no_deadline" : "unknown";
    else if (task.effectiveDueDate < now) task.state = "overdue";
    else if (task.effectiveDueDate <= now + 3 * 86400) task.state = "due_soon";
    else task.state = "upcoming";
    tasks.push(task);
  }
  const nextAssignmentOffset =
    offset + examined < all.length ? offset + examined : null;
  if (examined < selected.length)
    warnings.push(
      warning(
        "TASK_BUDGET_REACHED",
        "Further submission reads were deferred; resume at nextAssignmentOffset. Not-checked entries are not assumed overdue.",
      ),
    );
  const order: Record<TaskState, number> = {
    overdue: 0,
    due_soon: 1,
    unknown: 2,
    not_checked: 3,
    upcoming: 4,
    no_deadline: 5,
    submitted: 6,
    disabled: 7,
  };
  tasks.sort(
    (a, b) =>
      order[a.state] - order[b.state] ||
      (a.effectiveDueDate ?? Infinity) - (b.effectiveDueDate ?? Infinity) ||
      a.cmid - b.cmid,
  );
  const counts = Object.fromEntries(
    Object.keys(order).map((key) => [
      key,
      tasks.filter((t) => t.state === key).length,
    ]),
  );
  const complete =
    listingsComplete &&
    nextAssignmentOffset === null &&
    courses.nextCourseOffset === null &&
    (options.courseOffset ?? 0) === 0 &&
    offset === 0 &&
    !warnings.length;
  const data = {
    userId: client.userId,
    asOf: now,
    asOfIso: iso(now),
    items: tasks,
    counts,
    complete,
    coverage: {
      courseOffset: options.courseOffset ?? 0,
      maxCourses: options.maxCourses ?? 3,
      listedCourses: courses.items?.length ?? null,
      assignmentsInScannedCoursePage: all.length,
      assignmentOffset: offset,
      limit,
      statusChecks: checked,
      nextAssignmentOffset,
      nextCourseOffset:
        nextAssignmentOffset === null ? courses.nextCourseOffset : null,
      scope:
        "Only the selected course/assignment page. This is not site-wide completion or a full due-date inventory when partial.",
    },
  };
  return packet(
    data,
    "## Submission-aware tasks\n" +
      tasks
        .map(
          (t) =>
            `- ${t.name}: ${t.state}; effective deadline ${t.effectiveDueDateIso ?? "unknown/none"}`,
        )
        .join("\n"),
    { tasks: listingsComplete ? "available" : "unavailable" },
    warnings,
  );
}

export async function searchMaterials(
  client: MoodleClient,
  raw: z.infer<typeof searchInput>,
) {
  const options = searchInput.parse(raw),
    courses = await selectedCourses(client, options),
    warnings = [...courses.warnings];
  const terms = options.query
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
  const matches: {
    courseId: number;
    courseName: string;
    cmid: number;
    moduleType: string;
    name: string;
    sectionName: string;
    url: string;
    filenames: string[];
    snippet: string;
    snippetTruncated: boolean;
  }[] = [];
  let checked = 0,
    failed = 0;
  for (const course of courses.items ?? []) {
    try {
      const loaded = await loadSections(client, course.courseId);
      warnings.push(...loaded.warnings);
      checked++;
      for (const section of loaded.sections)
        for (const module of section.modules) {
          const description =
            module.description === undefined
              ? null
              : readableContent(module.description, 1, client.siteUrl, 8000);
          const filenames = (module.contents ?? []).flatMap((c) =>
            c.filename ? [c.filename] : [],
          );
          const haystack = [
            section.name,
            module.name,
            description?.text ?? "",
            ...filenames,
          ]
            .join(" ")
            .normalize("NFKC")
            .toLocaleLowerCase();
          if (terms.every((term) => haystack.includes(term)))
            matches.push({
              courseId: course.courseId,
              courseName: course.name,
              cmid: module.id,
              moduleType: module.modname,
              name: module.name,
              sectionName: section.name,
              url:
                client.siteUrl +
                "/mod/" +
                encodeURIComponent(module.modname) +
                "/view.php?id=" +
                module.id,
              filenames: filenames.slice(0, 50),
              snippet: (description?.text ?? section.name).slice(0, 1000),
              snippetTruncated:
                (description?.text.length ?? 0) > 1000 ||
                description?.truncated === true,
            });
        }
    } catch {
      failed++;
      warnings.push(
        warning(
          "SEARCH_COURSE_UNAVAILABLE",
          "Search could not inspect course " + course.courseId + ".",
        ),
      );
    }
  }
  const offset = options.offset ?? 0,
    limit = options.limit ?? 50,
    items = matches.slice(offset, offset + limit),
    nextOffset = offset + limit < matches.length ? offset + limit : null;
  return packet(
    {
      query: options.query,
      items,
      searchScope:
        "Visible section/activity/file names and bounded module descriptions. No binary full-text index or automatic file downloads.",
      scannedCourses: checked,
      failedCourses: failed,
      totalMatchesInScannedPage: matches.length,
      nextOffset,
      nextCourseOffset: nextOffset === null ? courses.nextCourseOffset : null,
      complete:
        courses.items !== null &&
        !failed &&
        courses.nextCourseOffset === null &&
        nextOffset === null &&
        (options.courseOffset ?? 0) === 0 &&
        offset === 0,
    },
    "## Material search\n" +
      items
        .map((m) => `- ${m.courseName} / ${m.name}: ${m.snippet}`)
        .join("\n"),
    { search: courses.items === null ? "unavailable" : "available" },
    warnings,
  );
}

export async function readRecentChanges(
  client: MoodleClient,
  raw: z.infer<typeof changesInput> = {},
  now = Math.floor(Date.now() / 1000),
) {
  const options = changesInput.parse(raw),
    since = options.since ?? now - 7 * 86400;
  if (since > now || now - since > 90 * 86400)
    throw new Error("Recent-change window must be in the past 90 days.");
  const courses = await selectedCourses(client, options),
    warnings = [...courses.warnings],
    items: {
      courseId: number;
      courseName: string;
      state: ReadState;
      updates: unknown;
    }[] = [];
  for (const course of courses.items ?? []) {
    try {
      const r = await invokeReadOperation(
        client,
        "core_course_get_updates_since",
        { courseId: course.courseId, since },
      );
      warnings.push(...r.warnings);
      items.push({
        courseId: course.courseId,
        courseName: course.name,
        state: r.capabilities.core_course_get_updates_since,
        updates: r.data.result,
      });
    } catch {
      items.push({
        courseId: course.courseId,
        courseName: course.name,
        state: "unavailable",
        updates: null,
      });
      warnings.push(
        warning(
          "CHANGES_UNAVAILABLE",
          "Recent-change data for course " +
            course.courseId +
            " was unavailable.",
        ),
      );
    }
  }
  return packet(
    {
      since,
      sinceIso: iso(since),
      items,
      nextCourseOffset: courses.nextCourseOffset,
      complete:
        courses.items !== null &&
        courses.nextCourseOffset === null &&
        (options.courseOffset ?? 0) === 0 &&
        items.every((i) => i.state === "available") &&
        !warnings.length,
    },
    "Recent activity is returned from Moodle update metadata; no activity was marked viewed.",
    { recentChanges: courses.state },
    warnings,
  );
}

export const assignmentDetailsInput = z
  .object({
    courseId: idSchema,
    assignmentId: idSchema,
    maxChars: z.number().int().min(100).max(64000).optional(),
  })
  .strict();
export async function readAssignmentDetails(
  client: MoodleClient,
  raw: z.infer<typeof assignmentDetailsInput>,
) {
  const options = assignmentDetailsInput.parse(raw),
    loaded = await loadSections(client, options.courseId);
  const schema = z.object({
    courses: z.array(
      z.object({
        id: idSchema,
        assignments: z.array(
          z.object({
            id: idSchema,
            cmid: idSchema,
            course: idSchema,
            name: z.string(),
            intro: z.string().nullish(),
            introformat: z.number().int().optional(),
            introattachments: z
              .array(
                z.object({
                  filename: z.string(),
                  filesize: z.number().optional(),
                  mimetype: z.string().optional(),
                }),
              )
              .optional(),
          }),
        ),
      }),
    ),
  });
  const response = await readApi(
    client,
    "mod_assign_get_assignments",
    { "courseids[0]": options.courseId },
    schema,
  );
  if (!response.value)
    throw new Error(
      "Assignment requirements could not be read (" + response.state + ").",
    );
  const matches = response.value.courses
    .filter((c) => c.id === options.courseId)
    .flatMap((c) => c.assignments)
    .filter(
      (a) =>
        a.id === options.assignmentId &&
        a.course === options.courseId &&
        loaded.sections.some((s) =>
          s.modules.some(
            (m) =>
              m.modname === "assign" &&
              m.id === a.cmid &&
              (m.instance === undefined || m.instance === a.id),
          ),
        ),
    );
  if (matches.length !== 1)
    throw new Error(
      "The assignment is not uniquely visible in the selected course.",
    );
  const a = matches[0],
    instructions =
      a.intro === null || a.intro === undefined
        ? null
        : readableContent(
            a.intro,
            a.introformat ?? 1,
            client.siteUrl,
            options.maxChars ?? 64000,
          );
  return packet(
    {
      courseId: a.course,
      assignmentId: a.id,
      cmid: a.cmid,
      name: a.name,
      instructions,
      attachments: (a.introattachments ?? [])
        .slice(0, 100)
        .map((f) => ({ ...f, downloadSupported: false })),
      requirementsInferred: false,
      complete:
        instructions !== null &&
        !instructions.truncated &&
        response.warnings.length === 0,
    },
    instructions?.text ??
      "No assignment instruction body was returned. This is not proof of no requirements.",
    { assignmentInstructions: response.state },
    [...loaded.warnings, ...response.warnings],
  );
}

function weekOf(seconds: number) {
  const d = new Date(seconds * 1000);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export async function readBriefing(
  client: MoodleClient,
  raw: z.infer<typeof briefInput> = {},
) {
  const options = briefInput.parse(raw),
    now = Math.floor(Date.now() / 1000),
    { period = "daily", ...taskOptions } = options;
  const tasks = await readTasks(client, taskOptions, now),
    timeline = await readCalendar(
      client,
      {
        daysAhead: options.daysAhead ?? (period === "daily" ? 7 : 30),
        lookbackDays: 7,
        limit: 50,
      },
      now,
    );
  const grades = await invokeReadOperation(
    client,
    "gradereport_overview_get_course_grades",
    {},
  );
  const workload: Record<string, number> = {};
  for (const task of tasks.data.items)
    if (
      task.effectiveDueDate !== null &&
      !["submitted", "disabled", "unknown", "not_checked"].includes(task.state)
    ) {
      const week = weekOf(task.effectiveDueDate);
      workload[week] = (workload[week] ?? 0) + 1;
    }
  return packet(
    {
      period,
      asOf: now,
      asOfIso: iso(now),
      tasks: tasks.data,
      timeline: timeline.data,
      gradeOverview: grades.data.result,
      workloadByWeek: Object.entries(workload)
        .sort()
        .map(([weekStart, count]) => ({
          weekStart,
          knownPendingAssignments: count,
        })),
      complete:
        tasks.data.complete &&
        timeline.data.complete &&
        grades.capabilities.gradereport_overview_get_course_grades ===
          "available",
      limits:
        "Counts and weekly load cover only the reported course/assignment page. No effort estimates or missing-submission assumptions are fabricated.",
    },
    `## ${period === "daily" ? "Daily briefing" : "Weekly review"}\n${tasks.text}\n${timeline.text}`,
    {
      tasks: tasks.capabilities.tasks,
      calendar: timeline.capabilities.calendar,
      grades: grades.capabilities.gradereport_overview_get_course_grades,
    },
    [...tasks.warnings, ...timeline.warnings, ...grades.warnings],
  );
}
