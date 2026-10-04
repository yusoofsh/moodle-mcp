import { inputRequired, type McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { MoodleClientSource } from "../moodle-source.js";
import { getToolClient, AUTH_META, READ_ONLY, canRegister } from "../tool-policy.js";
import { readTasks, type StudyTask } from "../student/insights.js";
import { observedManifest } from "./core.js";

export const studyChoices = z.object({ daysAhead: z.number().int().min(1).max(30), minutesPerDay: z.number().int().min(15).max(240), courseId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();
export const studyPlanInput = studyChoices.partial().extend({ courseOffset: z.number().int().min(0).max(100000).optional(), assignmentOffset: z.number().int().min(0).max(100000).optional() }).strict();
export function allocateStudy(tasks: StudyTask[], raw: z.infer<typeof studyChoices>) {
  const choices = studyChoices.parse(raw);
  const rank: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, no_deadline: 3, unknown: 4, not_checked: 4 };
  const candidates = tasks.filter(t => t.state !== "submitted" && t.state !== "disabled").sort((a, b) => (rank[a.state] ?? 4) - (rank[b.state] ?? 4) || (a.effectiveDueDate ?? Infinity) - (b.effectiveDueDate ?? Infinity) || a.cmid - b.cmid);
  const schedule = []; let cursor = 0;
  for (let day = 1; day <= choices.daysAhead && candidates.length; day++) {
    let remaining = choices.minutesPerDay;
    while (remaining >= 15) {
      const task = candidates[cursor++ % candidates.length]!; const minutes = Math.min(25, remaining);
      schedule.push({ day, minutes, courseId: task.courseId, cmid: task.cmid, name: task.name, state: task.state,
        action: task.state === "unknown" || task.state === "not_checked" ? "Verify submission status before starting" : "Study or work on this assignment",
        effectiveDueDateIso: task.effectiveDueDateIso, sourceUri: `moodle://activity/${task.courseId}/${task.cmid}`, sourceUrl: task.url, allocationIsEffortEstimate: false });
      remaining -= minutes;
    }
  }
  return { choices, schedule, totalAllocatedMinutes: schedule.reduce((sum, x) => sum + x.minutes, 0), allocationMeaning: "Suggested focus blocks, not estimated completion times or a guarantee that deadlines can be met.", excludedSubmittedOrDisabled: tasks.length - candidates.length };
}
export function registerStudyPlan(server: McpServer, source: MoodleClientSource) {
  if (!canRegister(source, "moodle_plan_study")) return;
  server.registerTool("moodle_plan_study", {
    title: "Plan a study window", description: "Build a read-only study plan from one authorized task page. Ask for available time and course when missing. Keeps submission state, unknown coverage and page cursors. Never submits coursework or changes completion.",
    inputSchema: studyPlanInput, annotations: READ_ONLY, _meta: AUTH_META,
  }, async (args, ctx) => {
    const response = ctx.mcpReq.inputResponses?.study_window as { action?: string; content?: unknown } | undefined;
    if (response && (response.action === "decline" || response.action === "cancel")) return { content: [{ type: "text", text: "Study planning cancelled. No course data was read." }] };
    const supplied = response?.action === "accept" ? response.content : { daysAhead: args.daysAhead, minutesPerDay: args.minutesPerDay, courseId: args.courseId };
    const parsed = studyChoices.safeParse(supplied);
    if (!parsed.success) {
      if (response) return { isError: true, content: [{ type: "text", text: "Study choices were invalid. Enter the bounded course and time choices again." }] };
      return inputRequired({ inputRequests: { study_window: inputRequired.elicit({ message: "Choose the study window. Course ID 0 means a bounded page of your enrolled courses.", requestedSchema: {
        type: "object", properties: { daysAhead: { type: "integer", title: "Days ahead", minimum: 1, maximum: 30 }, minutesPerDay: { type: "integer", title: "Study minutes per day", minimum: 15, maximum: 240 }, courseId: { type: "integer", title: "Course ID, or 0 for enrolled courses", minimum: 0 } }, required: ["daysAhead", "minutesPerDay", "courseId"], additionalProperties: false,
      } }) } });
    }
    const client = await getToolClient(source, "moodle_plan_study"), choices = parsed.data;
    const result = await readTasks(client, { daysAhead: choices.daysAhead, ...(choices.courseId ? { courseId: choices.courseId } : {}), courseOffset: args.courseOffset, assignmentOffset: args.assignmentOffset, maxCourses: 3, limit: 20 });
    const plan = { ...allocateStudy(result.data.items, choices), observedAt: result.data.asOfIso, complete: result.data.complete, coverage: result.data.coverage, warnings: result.warnings };
    const manifest = observedManifest("study-plan", result.data.items.map(t => ({ name: t.name, uri: `moodle://activity/${t.courseId}/${t.cmid}`, url: t.url })), result.data.complete);
    return { structuredContent: { plan, manifest }, content: [{ type: "text", text: JSON.stringify({ plan, manifest }) }] };
  });
}
