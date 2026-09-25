import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { loadSections } from "./course-data.js";
import {
  idSchema,
  flagSchema,
  flag,
  iso,
  packet,
  readApi,
  readOutputSchema,
} from "./result.js";
import { readableContent, contentSchema } from "./content-text.js";

export const quizReviewInput = z
  .object({
    courseId: idSchema,
    quizId: idSchema,
    attemptId: idSchema.optional(),
    page: z.number().int().min(0).max(499).optional(),
    maxCharsPerQuestion: z.number().int().min(100).max(16000).optional(),
  })
  .strict();
const attemptSchema = z.object({
  id: idSchema,
  quiz: idSchema,
  userid: idSchema,
  state: z.string(),
  preview: flagSchema.optional(),
  timestart: z.number().int().nullish(),
  timefinish: z.number().int().nullish(),
  sumgrades: z.union([z.number(), z.string()]).nullish(),
  layout: z.string().optional(),
  attempt: z.number().int().optional(),
});
const questionSchema = z.object({
  slot: idSchema,
  type: z.string().optional(),
  page: z.number().int().optional(),
  questionnumber: z.string().optional(),
  number: z.number().int().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
  html: z.string().optional(),
  mark: z.string().nullish(),
  maxmark: z.number().nullish(),
  flagged: flagSchema.optional(),
});
const reviewSchema = z.object({
  attempt: attemptSchema,
  grade: z.union([z.string(), z.number()]).nullish(),
  questions: z.array(questionSchema),
  additionaldata: z
    .array(z.object({ id: z.string(), title: z.string(), content: z.string() }))
    .optional(),
});
export const quizReviewOutput = readOutputSchema.extend({
  data: z.object({
    courseId: idSchema,
    quizId: idSchema,
    attemptId: idSchema.nullable(),
    reviewStatus: z.string(),
    page: z.number(),
    totalPages: z.number().nullable(),
    nextPage: z.number().nullable(),
    complete: z.boolean(),
    attempt: z
      .object({
        number: z.number().nullable(),
        state: z.literal("finished"),
        finishedAt: z.number().nullable(),
        finishedAtIso: z.string().nullable(),
        grade: z.union([z.string(), z.number()]).nullable(),
        sumGrades: z.union([z.string(), z.number()]).nullable(),
        marksReleased: z.boolean(),
      })
      .nullable(),
    questions: z
      .array(
        z.object({
          slot: idSchema,
          type: z.string().nullable(),
          page: z.number().nullable(),
          number: z.string().nullable(),
          state: z.string().nullable(),
          status: z.string().nullable(),
          mark: z.string().nullable(),
          maxMark: z.number().nullable(),
          flagged: z.boolean().nullable(),
          content: contentSchema,
        }),
      )
      .nullable(),
    feedback: z.array(
      z.object({ id: z.string(), title: z.string(), content: contentSchema }),
    ),
    canStartOrSubmitThroughMcp: z.literal(false),
  }),
});
export async function readQuizReview(
  client: MoodleClient,
  raw: z.infer<typeof quizReviewInput>,
) {
  const options = quizReviewInput.parse(raw),
    page = options.page ?? 0,
    { sections, warnings } = await loadSections(client, options.courseId);
  const matches = sections
    .flatMap((s) => s.modules)
    .filter((m) => m.modname === "quiz" && m.instance === options.quizId);
  if (matches.length !== 1)
    throw new Error(
      "The requested quiz is not uniquely visible in this course. Use the quiz instance ID, not cmid.",
    );
  const attempts = await readApi(
    client,
    "mod_quiz_get_user_attempts",
    {
      quizid: options.quizId,
      userid: client.userId,
      status: "finished",
      includepreviews: false,
    },
    z.object({ attempts: z.array(attemptSchema) }),
  );
  warnings.push(...attempts.warnings);
  const own =
    attempts.value?.attempts
      .filter(
        (a) =>
          a.quiz === options.quizId &&
          a.userid === client.userId &&
          a.state === "finished" &&
          flag(a.preview) !== true,
      )
      .sort(
        (a, b) => (b.timefinish ?? 0) - (a.timefinish ?? 0) || b.id - a.id,
      ) ?? [];
  const selected =
    options.attemptId === undefined
      ? own[0]
      : own.find((a) => a.id === options.attemptId);
  const blank = {
    courseId: options.courseId,
    quizId: options.quizId,
    attemptId: options.attemptId ?? null,
    reviewStatus:
      attempts.state === "available" ? "no_finished_attempt" : attempts.state,
    page,
    totalPages: null as number | null,
    nextPage: null as number | null,
    complete: false,
    attempt: null as null | {
      number: number | null;
      state: "finished";
      finishedAt: number | null;
      finishedAtIso: string | null;
      grade: string | number | null;
      sumGrades: string | number | null;
      marksReleased: boolean;
    },
    questions: null as
      | null
      | {
          slot: number;
          type: string | null;
          page: number | null;
          number: string | null;
          state: string | null;
          status: string | null;
          mark: string | null;
          maxMark: number | null;
          flagged: boolean | null;
          content: ReturnType<typeof readableContent>;
        }[],
    feedback: [] as {
      id: string;
      title: string;
      content: ReturnType<typeof readableContent>;
    }[],
    canStartOrSubmitThroughMcp: false as const,
  };
  if (
    options.attemptId !== undefined &&
    !selected &&
    attempts.state === "available"
  )
    throw new Error(
      "The selected attempt is not a finished non-preview attempt of the current student. Active, other-user and unknown attempts are not opened.",
    );
  if (!selected)
    return packet(
      blank,
      "No permitted finished attempt was selected. No quiz was started, advanced or submitted.",
      { quizAttempts: attempts.state },
      warnings,
    );
  const review = await readApi(
    client,
    "mod_quiz_get_attempt_review",
    { attemptid: selected.id, page },
    reviewSchema,
  );
  warnings.push(...review.warnings);
  if (!review.value)
    return packet(
      { ...blank, attemptId: selected.id, reviewStatus: review.state },
      "Review is unavailable under the current Moodle review policy. No alternative question endpoint was invoked.",
      { quizAttempts: attempts.state, quizReview: review.state },
      warnings,
    );
  const result = review.value;
  if (
    result.attempt.id !== selected.id ||
    result.attempt.quiz !== options.quizId ||
    result.attempt.userid !== client.userId ||
    result.attempt.state !== "finished"
  )
    throw new Error(
      "Returned review identity or finished state did not match the verified attempt.",
    );
  const layout = result.attempt.layout;
  const totalPages =
    layout && /^\d+(,\d+)*$/.test(layout)
      ? layout
          .split(",")
          .reduce(
            (count, part, index, array) =>
              count +
              (part === "0" && index > 0 && array[index - 1] !== "0" ? 1 : 0),
            0,
          ) + (layout.endsWith(",0") ? 0 : 1)
      : null;
  if (totalPages !== null && page >= totalPages)
    throw new Error(
      "Requested review page exceeds the verified attempt layout.",
    );
  const marksReleased =
    result.attempt.sumgrades !== undefined && result.attempt.sumgrades !== null;
  const questions = result.questions
    .filter((q) => q.page === undefined || q.page === page)
    .slice(0, 100)
    .map((q) => ({
      slot: q.slot,
      type: q.type ?? null,
      page: q.page ?? null,
      number:
        q.questionnumber ?? (q.number === undefined ? null : String(q.number)),
      state: q.state ?? null,
      status: q.status ?? null,
      mark: marksReleased ? (q.mark ?? null) : null,
      maxMark: marksReleased ? (q.maxmark ?? null) : null,
      flagged: flag(q.flagged),
      content: readableContent(
        q.html ?? "",
        1,
        client.siteUrl,
        options.maxCharsPerQuestion ?? 8000,
      ),
    }));
  const feedback = (result.additionaldata ?? []).slice(0, 30).map((f) => ({
    id: f.id,
    title: f.title,
    content: readableContent(f.content, 1, client.siteUrl, 8000),
  }));
  const data = {
    ...blank,
    attemptId: selected.id,
    reviewStatus: "available",
    totalPages,
    nextPage: totalPages !== null && page + 1 < totalPages ? page + 1 : null,
    complete:
      page === 0 &&
      totalPages === 1 &&
      questions.length === result.questions.length &&
      questions.every((q) => !q.content.truncated) &&
      feedback.every((f) => !f.content.truncated) &&
      warnings.length === 0,
    attempt: {
      number: result.attempt.attempt ?? null,
      state: "finished" as const,
      finishedAt: result.attempt.timefinish ?? null,
      finishedAtIso: iso(result.attempt.timefinish),
      grade: marksReleased ? (result.grade ?? null) : null,
      sumGrades: marksReleased ? (result.attempt.sumgrades ?? null) : null,
      marksReleased,
    },
    questions,
    feedback,
  };
  return packet(
    data,
    `## Finished quiz attempt ${selected.id}\n` +
      questions
        .map((q) => `### Question ${q.number ?? q.slot}\n${q.content.text}`)
        .join("\n") +
      "\nOnly Moodle-released review content is shown. No new attempt or view/read event was created.",
    { quizAttempts: attempts.state, quizReview: review.state },
    warnings,
  );
}
