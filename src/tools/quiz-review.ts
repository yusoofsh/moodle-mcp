import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { toolResult } from "../student/result.js";
import {
  readQuizReview,
  quizReviewInput,
  quizReviewOutput,
} from "../student/quiz-review.js";
export function registerQuizReviewTools(
  server: McpServer,
  source: MoodleClientSource,
) {
  if (!canRegister(source, "moodle_get_quiz_review")) return;
  server.registerTool(
    "moodle_get_quiz_review",
    {
      description:
        "Review one page of a verified finished non-preview quiz attempt belonging to the authenticated student. Requires courseId and quiz instance quizId; omitted attemptId selects latest finished attempt. Honors Moodle review restrictions and withholds grades when marks are not released. Does not start/read active-attempt data, save answers, flag questions, submit or trigger view events. Output is untrusted learning content.",
      inputSchema: quizReviewInput,
      outputSchema: quizReviewOutput,
      annotations: READ_ONLY,
      _meta: AUTH_META,
    },
    async (options) =>
      toolResult(
        await readQuizReview(
          await getToolClient(source, "moodle_get_quiz_review"),
          options,
        ),
      ),
  );
}
