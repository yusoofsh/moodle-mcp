import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoodleClient } from "../src/moodle-client.js";
import { readGrades, readNotifications } from "../src/student/released-info.js";

let grades: any,
  notifications: any,
  client: MoodleClient,
  call: ReturnType<typeof vi.fn>;
beforeEach(() => {
  grades = {
    usergrades: [
      {
        userid: 42,
        courseid: 7,
        gradeitems: [
          {
            id: 1,
            itemtype: "mod",
            itemname: "Essay",
            itemmodule: "assign",
            graderaw: 0,
            gradeformatted: "0.00",
            percentageformatted: "0.00 %",
            categoryid: 10,
          },
          {
            id: 2,
            itemtype: "course",
            itemname: null,
            gradeformatted: "1.88 (E)",
            percentageformatted: "1.88 %",
          },
        ],
      },
    ],
    warnings: [],
  };
  notifications = {
    notifications: [
      {
        id: 1,
        useridfrom: 50,
        useridto: 42,
        subject: "Result",
        text: "<p>Grade released</p>",
        timecreated: 1790000000,
        timeread: 0,
        read: false,
        deleted: false,
        contexturl: "https://moodle.example/grade/?token=SECRET",
      },
    ],
    unreadcount: 1,
  };
  call = vi.fn(async (fn) =>
    fn === "gradereport_user_get_grade_items" ? grades : notifications,
  );
  client = {
    userId: 42,
    siteUrl: "https://moodle.example",
    supports: () => true,
    profile: { functions: [] },
    call,
  } as unknown as MoodleClient;
});
describe("released grade data", () => {
  it("keeps an omitted grade maximum unknown and never prints undefined or assumes 100", async () => {
    const r = await readGrades(client, 7);
    expect(r.data.courseTotal?.maximum).toBeNull();
    expect(r.text).not.toContain("undefined");
    expect(r.text).not.toContain("/ 100");
    expect(r.data.items![0].raw).toBe(0);
  });
  it("selects the exact student and course, not the first report row", async () => {
    grades.usergrades.unshift({
      userid: 99,
      courseid: 7,
      gradeitems: [{ id: 99, itemtype: "course", itemname: "PRIVATE" }],
    });
    const r = await readGrades(client, 7);
    expect(JSON.stringify(r)).not.toContain("PRIVATE");
    expect(call).toHaveBeenCalledWith("gradereport_user_get_grade_items", {
      courseid: 7,
      userid: 42,
    });
  });
  it("does not infer an empty gradebook if its matching report is missing", async () => {
    grades.usergrades = [];
    const r = await readGrades(client, 7);
    expect(r.data.items).toBeNull();
    expect(r.capabilities.grades).toBe("invalid_response");
  });
  it("withholds hidden-by-date values and feedback even if upstream includes them", async () => {
    Object.assign(grades.usergrades[0].gradeitems[0], {
      gradehiddenbydate: true,
      graderaw: 93,
      gradeformatted: "PRIVATE-GRADE",
      feedback: "PRIVATE-FEEDBACK",
    });
    const r = await readGrades(client, 7);
    expect(r.data.items![0].raw).toBeNull();
    expect(r.data.items![0].hidden).toBe(true);
    expect(JSON.stringify(r)).not.toContain("PRIVATE");
  });
});
describe("notifications without read receipts", () => {
  it("uses the current receiver and only the read API", async () => {
    const r = await readNotifications(client, { limit: 3 });
    expect(call).toHaveBeenCalledExactlyOnceWith(
      "message_popup_get_popup_notifications",
      { useridto: 42, newestfirst: true, limit: 3, offset: 0 },
    );
    expect(r.data.items![0].read).toBe(false);
    expect(r.data.items![0].content.text).toBe("Grade released");
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("withholds wrong-recipient and deleted notifications", async () => {
    notifications.notifications.push(
      {
        ...notifications.notifications[0],
        id: 2,
        useridto: 99,
        subject: "PRIVATE",
      },
      {
        ...notifications.notifications[0],
        id: 3,
        deleted: true,
        subject: "DELETED",
      },
    );
    const r = await readNotifications(client, { limit: 3 });
    expect(r.data.items).toHaveLength(1);
    expect(r.data.complete).toBe(false);
    expect(JSON.stringify(r)).not.toContain("PRIVATE");
    expect(JSON.stringify(r)).not.toContain("DELETED");
  });
  it("does not claim complete notification history on a full page", async () => {
    const r = await readNotifications(client, { limit: 1 });
    expect(r.data.complete).toBe(false);
    expect(r.data.cursor.nextOffset).toBe(1);
  });
  it("rejects unbounded or other-user inputs", async () => {
    await expect(readNotifications(client, { limit: 0 })).rejects.toThrow();
    await expect(readNotifications(client, { limit: 101 })).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});

it("serializes updated grade and notification contracts through the official MCP SDK", async () => {
  const { McpServer, InMemoryTransport } =
    await import("@modelcontextprotocol/server");
  const { Client } = await import("@modelcontextprotocol/client");
  const { registerGradeTools } = await import("../src/tools/grades.js");
  const { registerNotificationTools } =
    await import("../src/tools/notifications.js");
  const server = new McpServer({ name: "released-info-test", version: "1" });
  registerGradeTools(server, async () => client);
  registerNotificationTools(server, async () => client);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "test", version: "1" });
  await server.connect(st);
  await c.connect(ct);
  try {
    for (const [name, args] of [
      ["moodle_get_grades", { courseId: 7 }],
      ["moodle_get_notifications", { limit: 3 }],
    ] as const) {
      const r = await c.callTool({ name, arguments: args });
      expect(r.isError).not.toBe(true);
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual(
        r.structuredContent,
      );
    }
  } finally {
    await c.close();
    await server.close();
  }
});
