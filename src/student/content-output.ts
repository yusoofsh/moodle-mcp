import { z } from "zod";
import { contentSchema } from "./content-text.js";
import { activityOutputSchema, activitySummarySchema } from "./output.js";
import { idSchema, readOutputSchema, readStates } from "./result.js";
const n = z.number().nullable(),
  s = z.string().nullable(),
  b = z.boolean().nullable();
const author = z.object({ userId: n, name: s });
const pagination = readOutputSchema.shape.pagination;
const event = z.object({
  eventId: idSchema,
  courseId: n,
  courseName: s,
  name: z.string(),
  eventType: s,
  startDate: n,
  startDateIso: s,
  sortDate: n,
  sortDateIso: s,
  durationSeconds: n,
  timing: z.enum(["past", "upcoming"]),
  isDeadline: z.boolean(),
  url: s,
  description: contentSchema.nullable(),
  action: z.object({ name: s, itemCount: n, actionable: b }).nullable(),
});
const timeline = z.object({
  userId: idSchema,
  courseId: n,
  from: z.number(),
  to: z.number(),
  fromIso: s,
  toIso: s,
  items: z.array(event).nullable(),
  cursor: z.object({
    mode: z.literal("upstream_event"),
    afterEventId: n,
    mayHaveMore: b,
    limit: z.number(),
  }),
  complete: z.boolean(),
  scope: z.string(),
});
export const contentOutputs = {
  moodle_get_resource: readOutputSchema.extend({
    data: z.object({
      activity: activityOutputSchema,
      contentStatus: z.enum(readStates),
      contentSource: s,
      description: contentSchema.nullable(),
      content: contentSchema.nullable(),
      selectedChapterId: n,
      chapters: z.array(
        z.object({
          chapterId: idSchema,
          title: z.string(),
          level: z.number(),
          filepath: z.string(),
        }),
      ),
      chaptersAvailable: z.boolean(),
      chapterPagination: pagination,
      files: z.array(
        z.object({
          filename: z.string(),
          filepath: z.string(),
          mimeType: z.string(),
          filesize: n,
          fileId: z.string(),
        }),
      ),
      fileInventoryStatus: z.enum(["available", "unavailable"]),
      filesComplete: z.boolean(),
      binaryExtraction: z.literal(false),
    }),
  }),
  moodle_list_forums: readOutputSchema.extend({
    data: z.object({
      courseId: idSchema,
      items: z.array(
        z.object({
          courseId: idSchema,
          cmid: idSchema,
          forumId: n,
          name: z.string(),
          sectionId: idSchema,
          sectionName: z.string(),
          type: s,
          url: z.string(),
          description: contentSchema.nullable(),
        }),
      ),
    }),
  }),
  moodle_get_forum_discussions: readOutputSchema.extend({
    data: z.object({
      forumId: idSchema,
      items: z
        .array(
          z.object({
            forumId: idSchema,
            discussionId: idSchema,
            firstPostId: idSchema,
            name: z.string(),
            author,
            replyCount: n,
            lastModified: n,
            lastModifiedIso: s,
            pinned: b,
            canReplyInMoodle: b,
            bridgeCanReply: z.literal(false),
            url: z.string(),
            content: contentSchema,
            contentAvailable: z.boolean(),
          }),
        )
        .nullable(),
      cursor: z.object({
        mode: z.literal("upstream_page"),
        page: z.number(),
        limit: z.number(),
        nextPage: n,
        mayHaveMore: b,
      }),
      complete: z.boolean(),
    }),
  }),
  moodle_get_forum_thread: readOutputSchema.extend({
    data: z.object({
      discussionId: idSchema,
      forumId: n,
      courseId: n,
      items: z
        .array(
          z.object({
            postId: idSchema,
            discussionId: idSchema,
            parentId: n,
            subject: z.string(),
            author,
            created: n,
            createdIso: s,
            modified: n,
            modifiedIso: s,
            privateReply: b,
            canReplyInMoodle: b,
            bridgeCanReply: z.literal(false),
            url: z.string(),
            content: contentSchema,
            attachments: z.array(
              z.object({
                filename: z.string(),
                filesize: n,
                mimeType: s,
                downloadViaMcp: z.literal(false),
              }),
            ),
            attachmentsTruncated: z.boolean(),
          }),
        )
        .nullable(),
      complete: z.boolean(),
      excludedPosts: n,
    }),
  }),
  moodle_get_calendar_events: readOutputSchema.extend({ data: timeline }),
  moodle_get_dashboard: readOutputSchema.extend({
    data: z.object({
      userId: idSchema,
      generatedAt: z.number(),
      generatedAtIso: s,
      courses: z
        .array(
          z.object({
            courseId: idSchema,
            name: z.string(),
            url: z.string(),
            reportedCourseCompleted: b,
            reportedProgressPercent: n,
            readStatus: z.enum(readStates),
            activityProgress: activitySummarySchema.nullable(),
            attendanceActivityCount: n,
          }),
        )
        .nullable(),
      timeline,
      complete: z.boolean(),
      coverage: z.object({
        coursePage: pagination,
        progressBasis: z.string(),
        timelineScope: z.string(),
        submissionStatesFetched: z.literal(false),
        maximumCourseReads: z.number(),
      }),
    }),
  }),
};
