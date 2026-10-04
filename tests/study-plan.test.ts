import { it, expect, vi } from "vitest";
import { allocateStudy, registerStudyPlan } from "../src/workflows/study-plan.js";
import type { StudyTask } from "../src/student/insights.js";
import type { McpServer } from "@modelcontextprotocol/server";
it("keeps exact budgets and never treats unknown status as overdue", () => {
  const tasks = [{ cmid: 1, state: "unknown", name: "Unknown" }, { cmid: 2, state: "submitted", name: "Done" }, { cmid: 3, state: "overdue", name: "Late" }].map(x => ({ ...x, courseId: 1, effectiveDueDate: null, effectiveDueDateIso: null, url: "https://example.test/activity" })) as StudyTask[];
  const plan = allocateStudy(tasks, { daysAhead: 3, minutesPerDay: 60, courseId: 0 });
  expect(plan.totalAllocatedMinutes).toBeLessThanOrEqual(180);
  expect(plan.schedule[0]!.name).toBe("Late");
  expect(plan.schedule.some(x => x.name === "Done")).toBe(false);
  expect(plan.schedule.find(x => x.name === "Unknown")!.action).toContain("Verify");
  expect(plan.schedule.every(x => x.allocationIsEffortEstimate === false)).toBe(true);
});
it("does not read Moodle before acceptance or after decline", async () => {
  const registerTool = vi.fn(), source = vi.fn().mockRejectedValue(new Error("must not fetch"));
  registerStudyPlan({ registerTool } as unknown as McpServer, source);
  const handler = registerTool.mock.calls[0]![2];
  expect((await handler({}, { mcpReq: {} })).resultType).toBe("input_required");
  const cancelled = await handler({}, { mcpReq: { inputResponses: { study_window: { action: "decline" } } } });
  expect(cancelled.content[0].text).toContain("cancelled"); expect(source).not.toHaveBeenCalled();
  const invalid = await handler({}, { mcpReq: { inputResponses: { study_window: { action: "accept", content: { daysAhead: 999, minutesPerDay: 60, courseId: 0 } } } } });
  expect(invalid.isError).toBe(true); expect(source).not.toHaveBeenCalled();
});
