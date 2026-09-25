import { z } from "zod";
import type { MoodleClientSource } from "../moodle-source.js";
import type { MoodleClient } from "../moodle-client.js";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { idSchema, pageShape, toolResult } from "../student/result.js";
import { readForums, readDiscussions, readThread } from "../student/forums.js";
import { contentOutputs } from "../student/content-output.js";
export async function listForums(
  client: MoodleClient,
  courseId: number,
): Promise<string> {
  return (await readForums(client, courseId)).text;
}
export async function getForumDiscussions(
  client: MoodleClient,
  forumId: number,
): Promise<string> {
  return (await readDiscussions(client, forumId)).text;
}
export function registerForumTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_list_forums"))
    server.registerTool(
      "moodle_list_forums",
      {
        description:
          "List visible course forums with correct instance forumId (not cmid), separate course-module ID, type and readable introduction. Optional bounded local pagination. Never views/marks a forum or subscribes.",
        inputSchema: z.object({ courseId: idSchema, ...pageShape }).strict(),
        outputSchema: contentOutputs.moodle_list_forums,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId, ...options }) =>
        toolResult(
          await readForums(
            await getToolClient(source, "moodle_list_forums"),
            courseId,
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_forum_discussions"))
    server.registerTool(
      "moodle_get_forum_discussions",
      {
        description:
          "Read a page of permitted forum discussions with discussionId, firstPostId, author, readable first-post body and links. forumId is the instance ID from moodle_list_forums, not cmid. Use moodle_get_forum_thread(discussionId) for replies. Preserves Moodle groups/timed/Q&A restrictions; no read receipts, view events or writes.",
        inputSchema: z
          .object({
            forumId: idSchema,
            page: z.number().int().min(0).max(100000).optional(),
            limit: z.number().int().min(1).max(50).optional(),
            maxChars: z.number().int().min(100).max(16000).optional(),
          })
          .strict(),
        outputSchema: contentOutputs.moodle_get_forum_discussions,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ forumId, ...options }) =>
        toolResult(
          await readDiscussions(
            await getToolClient(source, "moodle_get_forum_discussions"),
            forumId,
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_forum_thread"))
    server.registerTool(
      "moodle_get_forum_thread",
      {
        description:
          "Read permitted posts/replies in one discussion with parent IDs, readable text and safe links. Revalidates the current forum context, excludes deleted/non-viewable posts, and never marks anything as read or posts a reply. Attachment metadata only; attachment bytes are not yet supported. offset/limit are local output pagination; upstream response remains bounded.",
        inputSchema: z
          .object({
            discussionId: idSchema,
            ...pageShape,
            limit: z.number().int().min(1).max(50).optional(),
            maxChars: z.number().int().min(100).max(16000).optional(),
          })
          .strict(),
        outputSchema: contentOutputs.moodle_get_forum_thread,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ discussionId, ...options }) =>
        toolResult(
          await readThread(
            await getToolClient(source, "moodle_get_forum_thread"),
            discussionId,
            options,
          ),
        ),
    );
}
