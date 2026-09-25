import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { readOutputSchema, toolResult } from "../student/result.js";
import { READ_OPERATIONS, invokeReadOperation } from "../student/safe-api.js";
import { apiCoverage, coverageInput } from "../student/coverage-report.js";
import {
  taskInput,
  searchInput,
  briefInput,
  changesInput,
  assignmentDetailsInput,
  readTasks,
  searchMaterials,
  readBriefing,
  readRecentChanges,
  readAssignmentDetails,
} from "../student/insights.js";

export function registerCoverageTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  const shared = {
    outputSchema: readOutputSchema,
    annotations: READ_ONLY,
    _meta: AUTH_META,
  };
  if (canRegister(source, "moodle_read_api"))
    server.registerTool(
      "moodle_read_api",
      {
        ...shared,
        description:
          "Invoke ONE explicitly reviewed read-only Moodle adapter. Use moodle_get_api_coverage(includeInputSchemas=true) to see allowed functionName/parameters. This is not arbitrary REST passthrough: writes, views, attempts, token generation and unknown functions are blocked. User identity is injected; callers cannot choose another user or URL. Course/module visibility is rechecked. Bounded raw metadata is sanitized and may be partial.",
        inputSchema: z
          .object({
            functionName: z.string().min(1).max(150),
            parameters: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      },
      async ({ functionName, parameters }) =>
        toolResult(
          await invokeReadOperation(
            await getToolClient(source, "moodle_read_api"),
            functionName,
            parameters ?? {},
          ),
        ),
    );
  if (canRegister(source, "moodle_get_api_coverage"))
    server.registerTool(
      "moodle_get_api_coverage",
      {
        ...shared,
        description:
          "Inventory the actual advertised Moodle API functions, implemented routes, unexposed operations and upstream read/write declarations. Inventory coverage is NOT functional or live-test coverage. Optionally return exact parameter schemas for reviewed read adapters. Does not probe or execute listed APIs.",
        inputSchema: coverageInput,
      },
      async (options) =>
        toolResult(
          apiCoverage(
            await getToolClient(source, "moodle_get_api_coverage"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_tasks"))
    server.registerTool(
      "moodle_get_tasks",
      {
        ...shared,
        description:
          "Submission-aware task priorities across a bounded course/assignment page. Reads self/team status and individual extensions before calling work overdue. Distinguishes disabled, submitted, unknown and not_checked; no false overdue from missing data. Follow coverage.nextAssignmentOffset before nextCourseOffset. Defaults 3 courses/10 statuses, max5/20. No submissions or views.",
        inputSchema: taskInput,
      },
      async (options) =>
        toolResult(
          await readTasks(
            await getToolClient(source, "moodle_get_tasks"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_search_materials"))
    server.registerTool(
      "moodle_search_materials",
      {
        ...shared,
        description:
          "Search visible course section/activity/file names and bounded module descriptions. Unicode-aware all-term metadata search; not a PDF full-text index. Returns precise course/module IDs, snippets, coverage and continuation. Does not download every file or query an external search engine.",
        inputSchema: searchInput,
      },
      async (options) =>
        toolResult(
          await searchMaterials(
            await getToolClient(source, "moodle_search_materials"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_briefing"))
    server.registerTool(
      "moodle_get_briefing",
      {
        ...shared,
        description:
          "Daily or weekly student summary combining submission-aware tasks, action timeline, released grade overview and known pending workload by UTC week. Paging/unknowns remain explicit; no fabricated effort estimates or claims that a bounded page is the entire semester.",
        inputSchema: briefInput,
      },
      async (options) =>
        toolResult(
          await readBriefing(
            await getToolClient(source, "moodle_get_briefing"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_recent_activity"))
    server.registerTool(
      "moodle_get_recent_activity",
      {
        ...shared,
        description:
          "Read Moodle update metadata since a timestamp for a bounded page of visible courses. Defaults to seven days, maximum90. Does not mark modules viewed or notifications read. Missing/denied courses are recorded as unavailable, not silently empty.",
        inputSchema: changesInput,
      },
      async (options) =>
        toolResult(
          await readRecentChanges(
            await getToolClient(source, "moodle_get_recent_activity"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_assignment_details"))
    server.registerTool(
      "moodle_get_assignment_details",
      {
        ...shared,
        description:
          "Read the actual assignment instruction body after validating course/cmid/assignment identity. Returns bounded untrusted text and attachment metadata; does not invent requirement priorities, rubric interpretation or a submission plan. Attachment download support is explicit.",
        inputSchema: assignmentDetailsInput,
      },
      async (options) =>
        toolResult(
          await readAssignmentDetails(
            await getToolClient(source, "moodle_get_assignment_details"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_grades_overview"))
    server.registerTool(
      "moodle_get_grades_overview",
      {
        ...shared,
        description:
          "Read the current account grade overview across courses. Retains original grade scales and does not compute a fabricated GPA or treat missing grades as zero.",
        inputSchema: z.object({}).strict(),
      },
      async () =>
        toolResult(
          await invokeReadOperation(
            await getToolClient(source, "moodle_get_grades_overview"),
            "gradereport_overview_get_course_grades",
            {},
          ),
        ),
    );
}
