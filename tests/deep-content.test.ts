import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readableContent,
  safeContentUrl,
} from "../src/student/content-text.js";
import { readResource } from "../src/student/resources.js";
import {
  readForums,
  readDiscussions,
  readThread,
} from "../src/student/forums.js";
import { readCalendar, readDashboard } from "../src/student/dashboard.js";
import { MoodleApiError } from "../src/moodle-errors.js";
import type { MoodleClient } from "../src/moodle-client.js";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { registerAllTools } from "../src/register-tools.js";

const site = "https://moodle.example/learn";
const pageFile =
  site + "/webservice/pluginfile.php/99/mod_page/content/index.html";
let sections: any[],
  forumRows: any[],
  posts: any[],
  events: any[],
  call: ReturnType<typeof vi.fn>,
  download: ReturnType<typeof vi.fn>,
  client: MoodleClient,
  denied: Set<string>;
const pairs: { s: McpServer; c: Client }[] = [];
beforeEach(() => {
  denied = new Set();
  sections = [
    {
      id: 1,
      name: "Week 1",
      modules: [
        {
          id: 101,
          instance: 201,
          modname: "page",
          name: "Page",
          uservisible: true,
          description: "<p>Introduction &amp; objectives</p>",
          contents: [
            {
              type: "file",
              filename: "index.html",
              filepath: "/",
              fileurl: pageFile,
              filesize: 0,
              sortorder: 1,
            },
          ],
        },
        {
          id: 102,
          instance: 202,
          modname: "book",
          name: "Book",
          uservisible: true,
          contents: [
            {
              type: "content",
              filename: "structure",
              fileurl: null,
              content: JSON.stringify([
                {
                  title: "First chapter",
                  href: "301/index.html",
                  level: 0,
                  hidden: 0,
                  subitems: [
                    {
                      title: "Subchapter",
                      href: "302/index.html",
                      level: 1,
                      hidden: 0,
                      subitems: [],
                    },
                  ],
                },
                {
                  title: "HIDDEN",
                  href: "303/index.html",
                  hidden: 1,
                  subitems: [],
                },
              ]),
            },
            ...[301, 302, 303].map((id) => ({
              type: "file",
              filename: "index.html",
              filepath: `/${id}/`,
              fileurl:
                site +
                `/webservice/pluginfile.php/98/mod_book/chapter/${id}/index.html`,
              filesize: 0,
              content: "TITLE ONLY",
            })),
          ],
        },
        {
          id: 103,
          instance: 203,
          modname: "folder",
          name: "Folder",
          uservisible: true,
          contents: [
            {
              type: "file",
              filename: "lesson.pdf",
              filepath: "/week1/",
              fileurl:
                site +
                "/webservice/pluginfile.php/97/mod_folder/content/0/lesson.pdf",
              filesize: 5000,
              mimetype: "application/pdf",
            },
            {
              type: "file",
              filename: "external.pdf",
              filepath: "/",
              fileurl: "https://attacker.example/secret",
              filesize: 100,
            },
          ],
        },
        {
          id: 104,
          instance: 204,
          modname: "label",
          name: "Notice",
          uservisible: true,
          description: "<h2>Assignment note</h2><p>Read chapter 1.</p>",
        },
        {
          id: 105,
          instance: 205,
          modname: "forum",
          name: "Discussion",
          uservisible: true,
        },
        {
          id: 106,
          instance: 206,
          modname: "page",
          name: "Hidden",
          uservisible: false,
        },
        {
          id: 107,
          instance: 207,
          modname: "attendance",
          name: "Attendance",
          uservisible: true,
        },
      ],
    },
  ];
  forumRows = [
    {
      id: 205,
      cmid: 105,
      course: 7,
      name: "Discussion",
      type: "qanda",
      intro: "<p>Ask questions</p>",
    },
    { id: 999, cmid: 999, course: 7, name: "Hidden forum" },
  ];
  posts = [
    {
      id: 401,
      discussionid: 501,
      subject: "First",
      message: "<h2>Read this</h2><p>First content &amp; examples.</p>",
      messageformat: 1,
      parentid: null,
      timecreated: 1790340000,
      timemodified: 1790340001,
      isdeleted: false,
      isprivatereply: false,
      author: { id: 50, fullname: "Tutor" },
      capabilities: { view: true, reply: true },
      attachments: [
        {
          filename: "handout.pdf",
          filesize: 50,
          mimetype: "application/pdf",
          fileurl: site + "/pluginfile.php/a?token=SECRET",
        },
      ],
    },
    {
      id: 402,
      discussionid: 501,
      subject: "Hidden",
      message: "SECRET-HIDDEN",
      messageformat: 1,
      isdeleted: false,
      capabilities: { view: false },
    },
    {
      id: 403,
      discussionid: 501,
      subject: "Deleted",
      message: "SECRET-DELETED",
      isdeleted: true,
      capabilities: { view: true },
    },
    {
      id: 404,
      discussionid: 999,
      subject: "Other",
      message: "SECRET-OTHER",
      isdeleted: false,
      capabilities: { view: true },
    },
    {
      id: 405,
      discussionid: 501,
      subject: "Reply",
      message: "Response",
      messageformat: 0,
      parentid: 401,
      timecreated: 1790340002,
      isdeleted: false,
      capabilities: { view: true },
    },
  ];
  events = [
    {
      id: 601,
      name: "Essay due",
      course: { id: 7, fullname: "Test" },
      timestart: 1790500000,
      timesort: 1790500000,
      eventtype: "due",
      action: {
        name: "Submit",
        itemcount: 1,
        actionable: true,
        url: site + "/mod/assign/view.php?id=700",
      },
    },
    {
      id: 602,
      name: "Quiz opens",
      course: { id: 7 },
      timestart: 1790200000,
      timesort: 1790200000,
      eventtype: "open",
    },
  ];
  call = vi.fn(async (fn: string, params: any) => {
    if (fn === "core_course_get_contents") return sections;
    if (fn === "core_course_get_course_module")
      return {
        cm: {
          id: params.cmid,
          course: 7,
          instance: params.cmid + 100,
          modname: sections[0].modules.find((m: any) => m.id === params.cmid)
            ?.modname,
        },
      };
    if (fn === "mod_forum_get_forums_by_courses") return forumRows;
    if (fn === "mod_forum_get_forum_discussions")
      return {
        discussions: [
          {
            id: 401,
            discussion: 501,
            name: "Topic",
            userid: 50,
            userfullname: "Tutor",
            numreplies: 4,
            modified: 1790340001,
            timemodified: 1790340001,
            pinned: 0,
            message: "<p>First post body</p>",
            messageformat: 1,
          },
        ],
        warnings: [],
      };
    if (fn === "mod_forum_get_discussion_posts")
      return { forumid: 205, courseid: 7, posts, warnings: [] };
    if (fn === "core_enrol_get_users_courses")
      return [
        { id: 7, fullname: "Test", shortname: "T" },
        { id: 8, fullname: "Second", shortname: "S" },
      ];
    if (fn.startsWith("core_calendar_get_action_events_by_"))
      return {
        events,
        firstid: events[0]?.id ?? 0,
        lastid: events.at(-1)?.id ?? 0,
      };
    throw new Error("Unexpected API " + fn);
  });
  download = vi.fn(async () => ({
    mime: "text/html",
    bytes: new TextEncoder().encode(
      "<html><head><script>bad()</script></head><body><h1>Full learning content</h1><p>Not the description.</p></body></html>",
    ),
  }));
  client = {
    siteUrl: site,
    userId: 42,
    maxFileBytes: 2 * 1024 * 1024,
    call,
    downloadFile: download,
    supports: (fn: string) => !denied.has(fn),
    profile: { functions: [] },
    fileIdStore: { seal: vi.fn(async () => "f_synthetic") },
  } as unknown as MoodleClient;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No external network");
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const { s, c } of pairs.splice(0)) {
    await c.close();
    await s.close();
  }
});
async function mcp() {
  const s = new McpServer({ name: "test", version: "1" });
  registerAllTools(s, async () => client);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "test", version: "1" });
  pairs.push({ s, c });
  await s.connect(st);
  await c.connect(ct);
  return c;
}

describe("bounded HTML-to-text data, never execution", () => {
  it("preserves entities, paragraphs, lists and safe links but drops active content", () => {
    const r = readableContent(
      '<h1>Title &amp; more</h1><p>Hello <b>world</b></p><ul><li>One</li><li>Two</li></ul><script>SECRET-JS</script><style>SECRET-CSS</style><template>SECRET-TEMPLATE</template><a href="https://example.org/watch?v=abc&token=SECRET">Recording</a><iframe src="https://example.org/embed"></iframe>',
      1,
      site,
    );
    expect(r.text).toContain("Title & more");
    expect(r.text).toContain("Hello world");
    expect(r.text).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(r.links[0].url).toBe("https://example.org/watch?v=abc");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not truncate invisibly and does not double-decode HTML", () => {
    const r = readableContent("abc".repeat(100), 2, site, 20);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(20);
    expect(
      readableContent("&lt;script&gt;text&lt;/script&gt;", 1, site).text,
    ).toContain("<script>text</script>");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,abc",
    "https://user:pw@example.org/x",
    "file:///tmp/a",
  ])("refuses unsafe content URL %s", (value) =>
    expect(safeContentUrl(value, site)).toBeNull(),
  );
});
describe("first-class resources", () => {
  it("reads authorized Page body instead of treating the description as content", async () => {
    const r = await readResource(client, 101, 7);
    expect(r.data.content?.text).toContain("Full learning content");
    expect(r.data.description?.text).toContain("Introduction");
    expect(download).toHaveBeenCalledWith(pageFile, 512 * 1024);
    expect(r.data.contentSource).toBe("exported_html");
  });
  it("reads one selected visible Book chapter and preserves the table of contents", async () => {
    const r = await readResource(client, 102, 7, { chapterId: 302 });
    expect(r.data.chapters.map((c) => c.chapterId)).toEqual([301, 302]);
    expect(r.data.selectedChapterId).toBe(302);
    expect(download).toHaveBeenCalledTimes(1);
    expect(String(download.mock.calls[0][0])).toContain("/302/index.html");
    expect(JSON.stringify(r)).not.toContain("HIDDEN");
    expect(r.data.content?.text).not.toBe("TITLE ONLY");
  });
  it("never fetches an unlisted or hidden chapter", async () => {
    await expect(
      readResource(client, 102, 7, { chapterId: 303 }),
    ).rejects.toThrow(/chapter/i);
    expect(download).not.toHaveBeenCalled();
  });
  it("keeps folder hierarchy and opaque file IDs without fetching files", async () => {
    const r = await readResource(client, 103, 7);
    expect(r.data.files[0]).toMatchObject({
      filename: "lesson.pdf",
      filepath: "/week1/",
      fileId: "f_synthetic",
    });
    expect(r.data.files).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(download).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain("attacker.example");
  });
  it("reads Text/media label content and refuses Attendance view routines", async () => {
    const r = await readResource(client, 104, 7);
    expect(r.data.content?.text).toContain("Read chapter 1.");
    await expect(readResource(client, 107, 7)).rejects.toThrow(/supported/i);
    expect(download).not.toHaveBeenCalled();
  });
  it.each([false, 0])(
    "refuses explicitly hidden modules or sections: %s",
    async (hidden) => {
      sections[0].modules[0].uservisible = hidden;
      await expect(readResource(client, 101, 7)).rejects.toThrow(/visible/i);
      expect(download).not.toHaveBeenCalled();
    },
  );
  it("does not follow malicious exported HTML targets or render auth HTML as content", async () => {
    sections[0].modules[0].contents[0].fileurl =
      "https://attacker.example/index.html";
    const r = await readResource(client, 101, 7);
    expect(r.data.content).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });
  it("does not label missing book exports an empty book", async () => {
    sections[0].modules[1].contents = [];
    const r = await readResource(client, 102, 7);
    expect(r.data.contentStatus).not.toBe("available");
    expect(r.data.content).toBeNull();
  });
  it("supports module-only lookup and revalidates the course on each call", async () => {
    await readResource(client, 101);
    expect(call).toHaveBeenCalledWith("core_course_get_course_module", {
      cmid: 101,
    });
    sections[0].modules = [];
    await expect(readResource(client, 101)).rejects.toThrow(/visible/);
  });
  it("rejects a non-HTML file or oversized binary before parsing", async () => {
    download.mockResolvedValueOnce({
      mime: "application/pdf",
      bytes: new Uint8Array([37, 80, 68, 70]),
    });
    const r = await readResource(client, 101, 7);
    expect(r.data.content).toBeNull();
    expect(r.data.contentStatus).toBe("unavailable");
  });
});
describe("forum context, identifiers and thread content", () => {
  it("lists instance forumId separately from cmid", async () => {
    const r = await readForums(client, 7);
    expect(r.data.items[0]).toMatchObject({ forumId: 205, cmid: 105 });
    expect(r.data.items).toHaveLength(1);
  });
  it("uses documented integer sortorder and returns a discussion ID with first-post content", async () => {
    const r = await readDiscussions(client, 205);
    expect(call).toHaveBeenCalledWith("mod_forum_get_forum_discussions", {
      forumid: 205,
      sortorder: -1,
      page: 0,
      perpage: 20,
    });
    expect(r.data.items![0]).toMatchObject({
      discussionId: 501,
      firstPostId: 401,
      author: { name: "Tutor" },
    });
    expect(r.data.items![0].content.text).toContain("First post body");
  });
  it("keeps denied/deleted/mismatched posts out and preserves parent IDs", async () => {
    const r = await readThread(client, 501);
    expect(r.data.items!.map((p) => p.postId)).toEqual([401, 405]);
    expect(r.data.items![1].parentId).toBe(401);
    expect(r.data.items![0].content.text).toContain(
      "First content & examples.",
    );
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(call).toHaveBeenCalledWith("mod_forum_get_discussion_posts", {
      discussionid: 501,
      sortby: "created",
      sortdirection: "ASC",
      includeinlineattachments: false,
    });
  });
  it("does not expose posts if the returned forum is no longer visible", async () => {
    sections[0].modules[4].uservisible = false;
    await expect(readThread(client, 501)).rejects.toThrow(/visible|forum/i);
  });
  it("handles optional/read permissions without calling view/mark/read-status endpoints", async () => {
    denied.add("mod_forum_get_discussion_posts");
    const r = await readThread(client, 501);
    expect(r.capabilities.forumPosts).toBe("not_advertised");
    expect(r.data.items).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
  it("partial thread pagination remains explicitly partial", async () => {
    const r = await readThread(client, 501, { limit: 1 });
    expect(r.data.items).toHaveLength(1);
    expect(r.pagination?.nextOffset).toBe(1);
    expect(r.data.complete).toBe(false);
  });
});
describe("bounded student dashboard and action timeline", () => {
  it("uses course-specific calendar query before pagination, not global filtering", async () => {
    const r = await readCalendar(
      client,
      { courseId: 7, daysAhead: 30, lookbackDays: 14 },
      1790340000,
    );
    expect(call).toHaveBeenCalledWith(
      "core_calendar_get_action_events_by_course",
      expect.objectContaining({ courseid: 7, limitnum: 50 }),
    );
    expect(r.data.items![0].courseId).toBe(7);
    expect(r.data.items![1].timing).toBe("past");
    expect(r.data.items![1].isDeadline).toBe(false);
  });
  it("reports upstream cursor uncertainty honestly at a full page", async () => {
    const r = await readCalendar(client, { limit: 2 }, 1790340000);
    expect(r.data.cursor).toMatchObject({
      afterEventId: 602,
      mayHaveMore: true,
    });
  });
  it("aggregates a bounded page of enrolled courses and marks progress errors partial", async () => {
    const original = call.getMockImplementation()!;
    call.mockImplementation(async (fn, p) => {
      if (fn === "core_course_get_contents" && p.courseid === 8)
        throw new MoodleApiError("nopermissions", "SECRET");
      return original(fn, p);
    });
    const r = await readDashboard(client, { maxCourses: 2 });
    expect(r.data.courses).toHaveLength(2);
    expect(r.data.courses![1].readStatus).not.toBe("available");
    expect(r.data.complete).toBe(false);
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(
      call.mock.calls.filter((c) => c[0] === "core_course_get_contents"),
    ).toHaveLength(2);
  });
  it("does not misreport a failed calendar read as no deadlines", async () => {
    denied.add("core_calendar_get_action_events_by_timesort");
    const r = await readDashboard(client);
    expect(r.data.timeline.items).toBeNull();
    expect(r.data.complete).toBe(false);
  });
});
describe("MCP contracts", () => {
  it("returns identical structured/text JSON for deep content", async () => {
    const c = await mcp();
    const r = await c.callTool({
      name: "moodle_get_resource",
      arguments: { moduleId: 104, courseId: 7 },
    });
    expect(r.isError).not.toBe(true);
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual(
      r.structuredContent,
    );
  });
  it.each([
    "moodle_get_resource",
    "moodle_get_forum_thread",
    "moodle_get_dashboard",
  ])("rejects hidden writes and other-user arguments for %s", async (name) => {
    const c = await mcp();
    const r = await c.callTool({
      name,
      arguments: {
        moduleId: 104,
        courseId: 7,
        discussionId: 501,
        userId: 99,
        markRead: true,
      },
    });
    expect(r.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("edge cases and non-mutation regressions", () => {
  it("excludes a string-valued hidden Book chapter", async () => {
    const value = JSON.parse(sections[0].modules[1].contents[0].content);
    value[1].hidden = "1";
    sections[0].modules[1].contents[0].content = JSON.stringify(value);
    const r = await readResource(client, 102, 7);
    expect(r.data.chapters.map((c) => c.chapterId)).toEqual([301, 302]);
    expect(JSON.stringify(r)).not.toContain("HIDDEN");
  });
  it("preserves a nonzero forum page and never guesses that cmid is a forumId", async () => {
    await readDiscussions(client, 205, { page: 2, limit: 10 });
    expect(call).toHaveBeenCalledWith("mod_forum_get_forum_discussions", {
      forumid: 205,
      sortorder: -1,
      page: 2,
      perpage: 10,
    });
    delete sections[0].modules[4].instance;
    denied.add("mod_forum_get_forums_by_courses");
    const r = await readForums(client, 7);
    expect(r.data.items[0].forumId).toBeNull();
  });
  it("withholds posts with null view capability and never assumes placeholder author identity", async () => {
    posts[0].capabilities.view = null;
    const r = await readThread(client, 501);
    expect(r.data.items?.map((p) => p.postId)).toEqual([405]);
    expect(JSON.stringify(r)).not.toContain("First content");
  });
  it("marks truncated thread text partial", async () => {
    posts = [posts[0]];
    posts[0].message = "x".repeat(1000);
    const r = await readThread(client, 501, { maxChars: 100 });
    expect(r.data.items![0].content.truncated).toBe(true);
    expect(r.data.complete).toBe(false);
  });
  it("never makes forbidden operations or direct external network calls", async () => {
    await readResource(client, 104, 7);
    await readThread(client, 501);
    await readDashboard(client, { maxCourses: 1 });
    expect(
      call.mock.calls
        .map((c) => c[0])
        .some((fn) =>
          /(_view_|_mark_|_update_|_create_|_submit_|_save_|tool_mobile_get_content)/.test(
            fn,
          ),
        ),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps preserved existing listing metadata discoverable through structured-only gateways", async () => {
    const c = await mcp();
    const r = await c.callTool({
      name: "moodle_list_resources",
      arguments: { courseId: 7 },
    });
    expect(r.isError).not.toBe(true);
    expect(
      (r.structuredContent?.activities as any[]).some(
        (a) => a.moduleType === "book",
      ),
    ).toBe(true);
    expect(r.structuredContent?.text).toBe(
      (r.content as { text: string }[])[0].text,
    );
  });
});

it("does not claim that the final paginated fragment is the full result", async () => {
  const discussion = await readDiscussions(client, 205, { page: 1 });
  expect(discussion.data.complete).toBe(false);
  const thread = await readThread(client, 501, { offset: 1 });
  expect(thread.data.complete).toBe(false);
  const calendar = await readCalendar(client, { afterEventId: 10 }, 1790340000);
  expect(calendar.data.complete).toBe(false);
  const dashboard = await readDashboard(client, {
    courseOffset: 1,
    maxCourses: 1,
  });
  expect(dashboard.data.complete).toBe(false);
});
it("drops hidden HTML subtrees but preserves following visible content", () => {
  const r = readableContent(
    "<div hidden><p>SECRET</p><script>bad()</script></div><p>Visible</p>",
    1,
    site,
  );
  expect(r.text).toBe("Visible");
});
it("does not turn an empty or missing URL into a navigation link", () => {
  expect(safeContentUrl("", site)).toBeNull();
  expect(safeContentUrl(undefined, site)).toBeNull();
});
it("all existing and new forum calls have structured JSON parity via the SDK", async () => {
  const c = await mcp();
  for (const [name, args] of [
    ["moodle_list_forums", { courseId: 7 }],
    ["moodle_get_forum_discussions", { forumId: 205 }],
    ["moodle_get_forum_thread", { discussionId: 501 }],
    ["moodle_get_calendar_events", { courseId: 7 }],
    ["moodle_get_dashboard", { maxCourses: 1 }],
  ] as const) {
    const result = await c.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(
      result.structuredContent,
    );
  }
});

it("keeps a missing folder export distinct from a verified empty inventory", async () => {
  delete sections[0].modules[2].contents;
  const r = await readResource(client, 103, 7);
  expect(r.data.fileInventoryStatus).toBe("unavailable");
  expect(r.data.filesComplete).toBe(false);
});
it("treats encoded script links as data, never as navigable media", () => {
  const r = readableContent(
    '<a href="javascript&#x3a;alert(1)">Unsafe link</a><iframe src="data:text/html,bad"></iframe>',
    1,
    site,
  );
  expect(r.links).toEqual([]);
  expect(r.text).toBe("Unsafe link");
});
