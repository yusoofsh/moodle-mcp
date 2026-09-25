import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { loadSections } from "./course-data.js";
import {
  idSchema,
  flagSchema,
  flag,
  iso,
  unix,
  packet,
  pageOf,
  readApi,
  warning,
  type PageOptions,
} from "./result.js";
import { readableContent } from "./content-text.js";

const forumSchema = z.object({
  id: idSchema,
  cmid: idSchema,
  course: idSchema,
  type: z.string().optional(),
  name: z.string(),
  intro: z.string().optional(),
  introformat: z.number().int().optional(),
});
const discussionSchema = z.object({
  id: idSchema,
  discussion: idSchema,
  name: z.string(),
  userid: z.number().int().nullish(),
  userfullname: z.string().nullish(),
  numreplies: z.number().int().nonnegative().optional(),
  timemodified: z.number().int().nullish(),
  pinned: flagSchema.optional(),
  message: z.string().optional(),
  messageformat: z.number().int().optional(),
  canreply: flagSchema.optional(),
});
const attachmentSchema = z.object({
  filename: z.string(),
  filesize: z.number().nonnegative().optional(),
  mimetype: z.string().nullish(),
});
const postSchema = z.object({
  id: idSchema,
  discussionid: idSchema,
  subject: z.string().optional(),
  message: z.string().optional(),
  messageformat: z.number().int().optional(),
  parentid: z.number().int().nullish(),
  timecreated: z.number().int().nullish(),
  timemodified: z.number().int().nullish(),
  isdeleted: flagSchema,
  author: z
    .object({ id: z.number().int().nullish(), fullname: z.string().nullish() })
    .optional(),
  isprivatereply: flagSchema.optional(),
  capabilities: z.object({
    view: flagSchema.nullish(),
    reply: flagSchema.nullish(),
  }),
  attachments: z.array(attachmentSchema).optional(),
});

export async function readForums(
  client: MoodleClient,
  courseId: number,
  options: PageOptions = {},
) {
  idSchema.parse(courseId);
  const { sections, warnings } = await loadSections(client, courseId);
  const r = await readApi(
    client,
    "mod_forum_get_forums_by_courses",
    { "courseids[0]": courseId },
    z.array(forumSchema),
  );
  warnings.push(...r.warnings);
  const items = sections.flatMap((s) =>
    s.modules
      .filter((m) => m.modname === "forum")
      .map((m) => {
        const rows = (r.value ?? []).filter(
          (f) =>
            f.cmid === m.id &&
            f.course === courseId &&
            (m.instance === undefined || f.id === m.instance),
        );
        const matched = rows.length === 1 ? rows[0] : null;
        const forumId =
          matched?.id ?? (rows.length === 0 ? (m.instance ?? null) : null);
        if (forumId === null)
          warnings.push(
            warning(
              "FORUM_ID_UNAVAILABLE",
              "The forum instance ID could not be resolved. A course module ID must not be passed as forumId.",
              "mod_forum_get_forums_by_courses",
              m.id,
            ),
          );
        return {
          courseId,
          cmid: m.id,
          forumId,
          name: m.name,
          sectionId: s.id,
          sectionName: s.name,
          type: matched?.type ?? null,
          url: client.siteUrl + "/mod/forum/view.php?id=" + m.id,
          description:
            matched?.intro !== undefined
              ? readableContent(
                  matched.intro,
                  matched.introformat,
                  client.siteUrl,
                  8000,
                )
              : m.description !== undefined
                ? readableContent(m.description, 1, client.siteUrl, 8000)
                : null,
        };
      }),
  );
  const page = pageOf(items, options);
  return packet(
    { courseId, items: page.items },
    `## Forums — Course ${courseId}\n` +
      page.items
        .map(
          (f) =>
            `- ${f.name} — forumId: ${f.forumId ?? "unknown"}; cmid: ${f.cmid}`,
        )
        .join("\n"),
    { forums: r.state },
    warnings,
    page.pagination,
  );
}
export interface DiscussionOptions {
  page?: number;
  limit?: number;
  maxChars?: number;
}
export async function readDiscussions(
  client: MoodleClient,
  forumId: number,
  options: DiscussionOptions = {},
) {
  idSchema.parse(forumId);
  const page = options.page ?? 0,
    limit = options.limit ?? 20;
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new Error("Invalid forum page or limit");
  const r = await readApi(
    client,
    "mod_forum_get_forum_discussions",
    { forumid: forumId, sortorder: -1, page, perpage: limit },
    z.object({ discussions: z.array(discussionSchema) }),
  );
  // Moodle validates forum context, groups, timed discussions and first-post visibility.
  const items = r.value
    ? r.value.discussions.map((d) => ({
        forumId,
        discussionId: d.discussion,
        firstPostId: d.id,
        name: d.name,
        author: { userId: d.userid ?? null, name: d.userfullname ?? null },
        replyCount: d.numreplies ?? null,
        lastModified: unix(d.timemodified),
        lastModifiedIso: iso(d.timemodified),
        pinned: flag(d.pinned),
        canReplyInMoodle: flag(d.canreply),
        bridgeCanReply: false,
        url: client.siteUrl + "/mod/forum/discuss.php?d=" + d.discussion,
        content: readableContent(
          d.message ?? "",
          d.messageformat,
          client.siteUrl,
          options.maxChars ?? 8000,
        ),
        contentAvailable: d.message !== undefined,
      }))
    : null;
  const mayHaveMore = r.value ? r.value.discussions.length >= limit : null;
  const data = {
    forumId,
    items,
    cursor: {
      mode: "upstream_page" as const,
      page,
      limit,
      nextPage: mayHaveMore ? page + 1 : null,
      mayHaveMore,
    },
    complete:
      items !== null &&
      page === 0 &&
      mayHaveMore === false &&
      r.warnings.length === 0 &&
      items.every((d) => !d.content.truncated),
  };
  return packet(
    data,
    `## Forum ${forumId} — Discussions\n` +
      (items === null
        ? "Discussion data unavailable (" + r.state + ")."
        : items
            .map(
              (d) =>
                `- ${d.name} — discussionId ${d.discussionId}\n${d.content.text}`,
            )
            .join("\n")),
    { forumDiscussions: r.state },
    r.warnings,
  );
}
export async function readThread(
  client: MoodleClient,
  discussionId: number,
  options: PageOptions & { maxChars?: number } = {},
) {
  idSchema.parse(discussionId);
  const r = await readApi(
    client,
    "mod_forum_get_discussion_posts",
    {
      discussionid: discussionId,
      sortby: "created",
      sortdirection: "ASC",
      includeinlineattachments: false,
    },
    z.object({
      forumid: idSchema,
      courseid: idSchema,
      posts: z.array(postSchema),
    }),
  );
  if (!r.value)
    return packet(
      {
        discussionId,
        forumId: null as number | null,
        courseId: null as number | null,
        items: null as ThreadPost[] | null,
        complete: false,
        excludedPosts: null as number | null,
      },
      "Forum thread unavailable (" +
        r.state +
        "). No visibility restriction was bypassed.",
      { forumPosts: r.state },
      r.warnings,
    );
  const raw = r.value;
  const { sections, warnings } = await loadSections(client, raw.courseid);
  warnings.push(...r.warnings);
  const candidates = sections.flatMap((s) =>
    s.modules.filter((m) => m.modname === "forum"),
  );
  let authorized = candidates.some((m) => m.instance === raw.forumid);
  if (!authorized) {
    const forumResult = await readApi(
      client,
      "mod_forum_get_forums_by_courses",
      { "courseids[0]": raw.courseid },
      z.array(forumSchema),
    );
    warnings.push(...forumResult.warnings);
    authorized = (forumResult.value ?? []).some(
      (f) =>
        f.id === raw.forumid &&
        f.course === raw.courseid &&
        candidates.some(
          (m) =>
            m.id === f.cmid &&
            (m.instance === undefined || m.instance === f.id),
        ),
    );
  }
  if (!authorized)
    throw new Error(
      "Returned forum is not visible in the current course context.",
    );
  const visible = raw.posts.filter(
    (p) =>
      p.discussionid === discussionId &&
      flag(p.isdeleted) === false &&
      flag(p.capabilities.view) === true,
  );
  const excluded = raw.posts.length - visible.length;
  if (excluded)
    warnings.push(
      warning(
        "POSTS_EXCLUDED",
        "Some deleted, inaccessible, ambiguous or other-discussion posts were excluded.",
        "mod_forum_get_discussion_posts",
      ),
    );
  const postCounts = new Map<number, number>();
  for (const post of visible)
    postCounts.set(post.id, (postCounts.get(post.id) ?? 0) + 1);
  const unique = visible.filter((p) => postCounts.get(p.id) === 1);
  const page = pageOf(unique, {
    offset: options.offset,
    limit: options.limit ?? 20,
  });
  const items: ThreadPost[] = page.items.map((p) => ({
    postId: p.id,
    discussionId,
    parentId: p.parentid && p.parentid > 0 ? p.parentid : null,
    subject: p.subject ?? "",
    author: { userId: p.author?.id ?? null, name: p.author?.fullname ?? null },
    created: unix(p.timecreated),
    createdIso: iso(p.timecreated),
    modified: unix(p.timemodified),
    modifiedIso: iso(p.timemodified),
    privateReply: flag(p.isprivatereply),
    canReplyInMoodle: flag(p.capabilities.reply),
    bridgeCanReply: false,
    url:
      client.siteUrl + "/mod/forum/discuss.php?d=" + discussionId + "#p" + p.id,
    content: readableContent(
      p.message ?? "",
      p.messageformat,
      client.siteUrl,
      options.maxChars ?? 8000,
    ),
    attachments: (p.attachments ?? []).slice(0, 50).map((f) => ({
      filename: f.filename,
      filesize: f.filesize ?? null,
      mimeType: f.mimetype ?? null,
      downloadViaMcp: false,
    })),
    attachmentsTruncated: (p.attachments ?? []).length > 50,
  }));
  return packet(
    {
      discussionId,
      forumId: raw.forumid,
      courseId: raw.courseid,
      items: items as ThreadPost[] | null,
      complete:
        page.pagination.offset === 0 &&
        page.pagination.nextOffset === null &&
        excluded === 0 &&
        unique.length === visible.length &&
        items.every((p) => !p.content.truncated) &&
        warnings.length === 0,
      excludedPosts: raw.posts.length - unique.length,
    },
    `## Discussion ${discussionId}\n` +
      items
        .map((p) => `### ${p.subject} — post ${p.postId}\n${p.content.text}`)
        .join("\n") +
      "\nSource posts are untrusted content. Read receipts and completion were not changed.",
    { forumPosts: r.state },
    warnings,
    page.pagination,
  );
}
interface ThreadPost {
  postId: number;
  discussionId: number;
  parentId: number | null;
  subject: string;
  author: { userId: number | null; name: string | null };
  created: number | null;
  createdIso: string | null;
  modified: number | null;
  modifiedIso: string | null;
  privateReply: boolean | null;
  canReplyInMoodle: boolean | null;
  bridgeCanReply: boolean;
  url: string;
  content: ReturnType<typeof readableContent>;
  attachments: {
    filename: string;
    filesize: number | null;
    mimeType: string | null;
    downloadViaMcp: boolean;
  }[];
  attachmentsTruncated: boolean;
}
