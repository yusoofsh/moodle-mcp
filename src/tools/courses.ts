import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../moodle-client.js";

interface Course {
  id: number;
  fullname: string;
  shortname: string;
  startdate: number;
  enddate: number;
  summary: string;
}

interface CourseModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
  description?: string;
}

interface CourseSection {
  id: number;
  name: string;
  summary: string;
  modules: CourseModule[];
}

export async function listCourses(client: MoodleClient): Promise<string> {
  const courses = await client.call<Course[]>("core_enrol_get_users_courses", {
    userid: client.userId,
  });
  if (courses.length === 0) return "You are not enrolled in any courses.";
  const lines = courses.map(
    (c) => `- **${c.fullname}** (${c.shortname}) — ID: \`${c.id}\``,
  );
  return `## Your Courses\n\n${lines.join("\n")}`;
}

export async function getCourse(
  client: MoodleClient,
  courseId: number,
): Promise<string> {
  const sections = await client.call<CourseSection[]>(
    "core_course_get_contents",
    {
      courseid: courseId,
    },
  );
  if (sections.length === 0) return "This course has no content.";
  const lines: string[] = [];
  for (const section of sections) {
    if (section.modules.length === 0) continue;
    lines.push(`### ${section.name || "General"}`);
    for (const mod of section.modules) {
      const link = mod.url ? ` — [open](${mod.url})` : "";
      lines.push(`- \`${mod.modname}\` **${mod.name}**${link}`);
    }
  }
  return lines.length ? lines.join("\n") : "This course has no content.";
}

export function registerCourseTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_list_courses"))
    server.registerTool(
      "moodle_list_courses",
      {
        description: "List all Moodle courses you are enrolled in",
        inputSchema: z.object({}),
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async () => {
        const client = await getToolClient(source, "moodle_list_courses");
        return {
          content: [{ type: "text" as const, text: await listCourses(client) }],
        };
      },
    );

  if (canRegister(source, "moodle_get_course"))
    server.registerTool(
      "moodle_get_course",
      {
        description:
          "Get the sections and modules of a specific course. Use moodle_list_courses first to get course IDs.",
        inputSchema: z.object({
          courseId: z.number().describe("Course ID from moodle_list_courses"),
        }),
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId }) => {
        const client = await getToolClient(source, "moodle_get_course");
        return {
          content: [
            { type: "text" as const, text: await getCourse(client, courseId) },
          ],
        };
      },
    );
}
