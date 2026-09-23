import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "summarize-course",
    {
      description:
        "Summarize a Moodle course — sections, materials, and activities — organized by the course's own structure",
      argsSchema: z.object({
        courseId: z.string().describe("Course ID (from moodle_list_courses)"),
      }),
    },
    async ({ courseId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please summarize my Moodle course with ID ${courseId}.

Steps:
1. Call moodle_get_course with courseId=${courseId} to see all sections and modules
2. Call moodle_list_resources with courseId=${courseId} to see all files and links
3. Call moodle_list_assignments with courseId=${courseId} to see graded work
4. Produce a structured summary organized by the course's own sections
   - For each section: what it covers, what materials are available, any assignments
   - End with: total sections, files, assignments, and overall course scope`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "whats-due",
    {
      description:
        "Show everything that's due soon across all courses (or one course), prioritized by urgency",
      argsSchema: z.object({
        courseId: z
          .string()
          .optional()
          .describe("Filter to a specific course ID (optional)"),
      }),
    },
    async ({ courseId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: courseId
              ? `What's due soon in my course ${courseId}?

1. Call moodle_get_calendar_events with courseId=${courseId} and daysAhead=30
2. Call moodle_list_assignments with courseId=${courseId}
3. Present a prioritized list: **This week** / **Next week** / **Later**
   Include assignment name, course, due date, and submission status`
              : `What's due soon across all my courses?

1. Call moodle_list_courses to get all my courses
2. Call moodle_get_calendar_events (no courseId filter) with daysAhead=14
3. For any course with upcoming events, call moodle_list_assignments
4. Present a prioritized list: **This week** / **Next week** / **Later**
   Group by course, include due date and submission status`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "build-study-notes",
    {
      description:
        "Read all course materials and build a linked Obsidian vault — one note per topic, with [[wikilinks]] between concepts and a MOC index",
      argsSchema: z.object({
        courseId: z.string().describe("Course ID (from moodle_list_courses)"),
        vaultPath: z
          .string()
          .describe(
            "Absolute path to your Obsidian vault folder, e.g. ~/obsidian/finals",
          ),
      }),
    },
    async ({ courseId, vaultPath }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Build an Obsidian study vault for my course ${courseId} at ${vaultPath}.

Steps:
1. Call moodle_get_course with courseId=${courseId} to get the course structure
2. Call moodle_list_resources with courseId=${courseId} to get all files
3. For each file listed, call moodle_download_file with its opaque fileId to read the actual content
4. Call moodle_list_assignments with courseId=${courseId} to get graded work
5. Call moodle_get_grades with courseId=${courseId} to see grade feedback

Then write to ${vaultPath}/:
- One .md file per course section (named after the section)
- Each file contains: summary of the section's content, key concepts, definitions, examples from the materials
- Use [[wikilinks]] to link related concepts between notes (e.g. a term defined in Week 1 that's used in Week 3)
- A MOC.md (Map of Content) index that links to all section notes with one-line descriptions
- Tags at the top of each note matching the section name

The goal: open this vault in Obsidian, enable Graph View, and see the whole course as a knowledge graph.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "exam-prep",
    {
      description:
        "Generate a topic-by-topic study guide based on course content, quiz results, and grade feedback",
      argsSchema: z.object({
        courseId: z.string().describe("Course ID (from moodle_list_courses)"),
      }),
    },
    async ({ courseId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help me prepare for my exam in course ${courseId}.

Steps:
1. Call moodle_get_course with courseId=${courseId} to get all topics
2. Call moodle_list_resources with courseId=${courseId} for materials
3. Call moodle_get_grades with courseId=${courseId} to see where I lost points
4. Call moodle_list_quizzes with courseId=${courseId} and for each quiz call moodle_get_quiz_attempts
5. Call moodle_list_assignments with courseId=${courseId}

Produce a study guide:
- **Weak spots** (topics where I lost grade points or failed quiz questions) — prioritize these
- **Topic by topic** breakdown: key concepts, likely exam questions, things to review
- **Quick reference** — key formulas, definitions, and facts in bullet form
- **Suggested study order** based on difficulty and point weight`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "search-notes",
    {
      description:
        "Find all course materials related to a topic using natural language — reads matching files and synthesizes a focused answer",
      argsSchema: z.object({
        courseId: z.string().describe("Course ID (from moodle_list_courses)"),
        query: z
          .string()
          .describe(
            "What you're looking for, e.g. 'derivatives and limits', 'OSI model', 'contrat de travail'",
          ),
      }),
    },
    async ({ courseId, query }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Search my course ${courseId} for everything about: "${query}"

Steps:
1. Call moodle_get_course with courseId=${courseId} to see all section names and module names
2. Call moodle_list_resources with courseId=${courseId} to see all file names
3. Look at the section names, module names, and file names — identify which ones are likely to contain information about "${query}" (semantic reasoning, not just keyword match)
4. For each relevant file, call moodle_download_file with its opaque fileId
5. Synthesize a focused answer about "${query}" from what you found

Format: brief intro, then the key content organized by subtopic, then which files/sections it came from.`,
          },
        },
      ],
    }),
  );
}
