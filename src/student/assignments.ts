import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { loadSections } from "./course-data.js";
import {
  flag,
  flagSchema,
  idSchema,
  iso,
  packet,
  pageOf,
  readApi,
  singleLine,
  unix,
  warning,
  type PageOptions,
} from "./result.js";

const assignmentSchema = z.object({
  id: idSchema,
  cmid: idSchema,
  course: idSchema,
  name: z.string(),
  duedate: z.number().int().optional(),
  allowsubmissionsfromdate: z.number().int().optional(),
  cutoffdate: z.number().int().optional(),
  grade: z.number().finite().optional(),
  nosubmissions: flagSchema.optional(),
  submissiondrafts: flagSchema.optional(),
  teamsubmission: flagSchema.optional(),
  intro: z.string().optional(),
});
const assignmentResponse = z.object({
  courses: z.array(
    z.object({ id: idSchema, assignments: z.array(z.unknown()) }),
  ),
});
/** Moodle 4.5 uses cmid, not coursemodule. Never join by array position or instance ID. */
export async function readAssignments(
  client: MoodleClient,
  courseId: number,
  options: PageOptions = {},
) {
  idSchema.parse(courseId);
  const { sections, warnings } = await loadSections(client, courseId);
  const result = await readApi(
    client,
    "mod_assign_get_assignments",
    { "courseids[0]": courseId },
    assignmentResponse,
  );
  warnings.push(...result.warnings);
  const courses = result.value?.courses.filter((c) => c.id === courseId) ?? [];
  if (courses.length !== 1 && result.state === "available")
    warnings.push(
      warning(
        "COURSE_NOT_RETURNED",
        "The requested assignment course was missing or ambiguous.",
        "mod_assign_get_assignments",
      ),
    );
  const rows: z.infer<typeof assignmentSchema>[] = [];
  for (const raw of courses.length === 1 ? courses[0].assignments : []) {
    const p = assignmentSchema.safeParse(raw);
    if (p.success && p.data.course === courseId) rows.push(p.data);
    else
      warnings.push(
        warning(
          "INVALID_ASSIGNMENT_ROW",
          "An assignment response did not match the expected course/ID schema.",
          "mod_assign_get_assignments",
        ),
      );
  }
  const items = sections.flatMap((section) =>
    section.modules
      .filter((m) => m.modname === "assign")
      .map((module) => {
        const matches = rows.filter(
          (a) =>
            a.cmid === module.id &&
            (module.instance === undefined || module.instance === a.id),
        );
        const detail = matches.length === 1 ? matches[0] : null;
        if (!detail)
          warnings.push(
            warning(
              "ASSIGNMENT_DETAILS_UNAVAILABLE",
              "This visible activity has no unambiguous matching assignment details.",
              "mod_assign_get_assignments",
              module.id,
            ),
          );
        return {
          courseId,
          sectionId: section.id,
          sectionName: section.name,
          cmid: module.id,
          instanceId: module.instance ?? detail?.id ?? null,
          assignmentId: detail?.id ?? null,
          moduleType: "assign",
          name: detail?.name ?? module.name,
          url: client.siteUrl + "/mod/assign/view.php?id=" + module.id,
          detailsStatus: detail
            ? "available"
            : result.state === "available"
              ? "not_returned"
              : result.state,
          dueDate: unix(detail?.duedate),
          dueDateIso: iso(detail?.duedate),
          dueDateState:
            detail?.duedate === 0
              ? "none"
              : unix(detail?.duedate) !== null
                ? "known"
                : "unknown",
          openDate: unix(detail?.allowsubmissionsfromdate),
          openDateIso: iso(detail?.allowsubmissionsfromdate),
          cutoffDate: unix(detail?.cutoffdate),
          cutoffDateIso: iso(detail?.cutoffdate),
          grade:
            detail?.grade === undefined
              ? null
              : detail.grade > 0
                ? { type: "points", maximum: detail.grade, scaleId: null }
                : detail.grade < 0
                  ? { type: "scale", maximum: null, scaleId: -detail.grade }
                  : { type: "none", maximum: null, scaleId: null },
          submissionsEnabled:
            detail?.nosubmissions === undefined
              ? null
              : !flag(detail.nosubmissions),
          draftsEnabled: flag(detail?.submissiondrafts),
          teamSubmission: flag(detail?.teamsubmission),
          deadlineSource: detail
            ? "mod_assign_get_assignments (effective access); individual extension is returned by moodle_get_assignment"
            : null,
        };
      }),
  );
  const page = pageOf(items, options);
  const text = [
    `## Assignments — Course ${courseId}`,
    ...page.items.map(
      (a) =>
        `- **${singleLine(a.name)}** — ${a.detailsStatus === "available" ? (a.dueDateState === "known" ? "Due (UTC): " + a.dueDateIso : a.dueDateState === "none" ? "No due date" : "Due date unknown") : "details unavailable (" + a.detailsStatus + ")"}\n  cmid: ${a.cmid}; assignmentId: ${a.assignmentId ?? "unknown"}${a.grade?.maximum !== null && a.grade?.maximum !== undefined ? "; Max grade: " + a.grade.maximum : ""}`,
    ),
    ...(items.length === 0
      ? ["No visible assignments returned by course contents."]
      : []),
    ...(warnings.length
      ? ["Warnings present; inspect structured warnings."]
      : []),
  ].join("\n");
  return packet(
    { courseId, items: page.items },
    text,
    { assignments: result.state },
    warnings,
    page.pagination,
  );
}

const submissionRecord = z.object({
  id: z.number().int().optional(),
  userid: z.number().int().optional(),
  groupid: z.number().int().optional(),
  status: z.string().optional(),
  timemodified: z.number().int().optional(),
  attemptnumber: z.number().int().optional(),
});
const statusSchema = z.object({
  lastattempt: z
    .object({
      submission: submissionRecord.optional(),
      teamsubmission: submissionRecord.optional(),
      graded: flagSchema.optional(),
      submissionsenabled: flagSchema.optional(),
      locked: flagSchema.optional(),
      canedit: flagSchema.optional(),
      cansubmit: flagSchema.optional(),
      // Moodle initializes this to null until per-user flags exist.
      extensionduedate: z.number().int().nullish(),
      gradingstatus: z.string().optional(),
    })
    .optional(),
  feedback: z
    .object({
      gradefordisplay: z.string().nullish(),
      gradeddate: z.number().int().nullish(),
      grade: z
        .object({
          grade: z.string().optional(),
          userid: z.number().int().optional(),
        })
        .optional(),
    })
    .optional(),
});
export async function readAssignmentStatus(
  client: MoodleClient,
  assignmentId: number,
) {
  idSchema.parse(assignmentId);
  const r = await readApi(
    client,
    "mod_assign_get_submission_status",
    { assignid: assignmentId, userid: client.userId },
    statusSchema,
  );
  const received = r.value?.lastattempt;
  const identityMismatch =
    (received?.submission?.userid !== undefined &&
      received.submission.userid !== client.userId) ||
    (received?.teamsubmission?.userid !== undefined &&
      received.teamsubmission.userid !== 0 &&
      received.teamsubmission.userid !== client.userId);
  if (identityMismatch)
    r.warnings.push(
      warning(
        "ACCOUNT_MISMATCH",
        "Submission identity did not match the current account; status and feedback were withheld.",
        "mod_assign_get_submission_status",
      ),
    );
  const last = identityMismatch ? undefined : received;
  const individual = last?.submission;
  const validIndividual =
    individual &&
    (individual.userid === undefined || individual.userid === client.userId)
      ? individual
      : undefined;
  if (individual && !validIndividual)
    r.warnings.push(
      warning(
        "ACCOUNT_MISMATCH",
        "Submission identity did not match the current account.",
        "mod_assign_get_submission_status",
      ),
    );
  const team = last?.teamsubmission;
  const validTeam =
    team &&
    (team.userid === undefined ||
      team.userid === 0 ||
      team.userid === client.userId)
      ? team
      : undefined;
  if (team && !validTeam)
    r.warnings.push(
      warning(
        "ACCOUNT_MISMATCH",
        "Team submission identity could not be verified.",
        "mod_assign_get_submission_status",
      ),
    );
  const submission = validTeam ?? validIndividual;
  const knownStatuses = new Set(["new", "draft", "submitted", "reopened"]);
  const submissionStatus =
    submission?.status && knownStatuses.has(submission.status)
      ? submission.status === "new"
        ? "not_submitted"
        : submission.status
      : !last
        ? "unknown"
        : !individual && !team && flag(last.submissionsenabled) === true
          ? "not_submitted"
          : flag(last.submissionsenabled) === false
            ? "disabled"
            : "unknown";
  const feedback = identityMismatch ? undefined : r.value?.feedback;
  const ownFeedback =
    feedback &&
    (feedback.grade?.userid === undefined ||
      feedback.grade.userid === client.userId)
      ? feedback
      : undefined;
  const data = {
    assignmentId,
    userId: client.userId,
    readStatus: r.state,
    submissionStatus,
    submissionKind: validTeam ? "team" : validIndividual ? "individual" : null,
    lastModified: unix(submission?.timemodified),
    lastModifiedIso: iso(submission?.timemodified),
    attemptNumber: submission?.attemptnumber ?? null,
    graded: flag(last?.graded),
    gradingStatus: last?.gradingstatus ?? null,
    submissionsEnabled: flag(last?.submissionsenabled),
    locked: flag(last?.locked),
    canEditInMoodle: flag(last?.canedit),
    canSubmitInMoodle: flag(last?.cansubmit),
    bridgeCanSubmit: false,
    extensionDueDate: unix(last?.extensionduedate),
    extensionDueDateIso: iso(last?.extensionduedate),
    feedback: ownFeedback
      ? {
          grade: ownFeedback.grade?.grade ?? null,
          display: ownFeedback.gradefordisplay ?? null,
          gradedDate: unix(ownFeedback.gradeddate),
          gradedDateIso: iso(ownFeedback.gradeddate),
        }
      : null,
  };
  const text = [
    `## Assignment ${assignmentId} — Submission Status`,
    `Status: ${submissionStatus}`,
    `Graded: ${data.graded === null ? "Unknown" : data.graded ? "Yes" : "No"}`,
    data.feedback?.display !== null && data.feedback?.display !== undefined
      ? `Grade: ${data.feedback.display}`
      : "Grade: not returned",
    data.extensionDueDateIso
      ? `Individual extension (UTC): ${data.extensionDueDateIso}`
      : "",
    r.state !== "available"
      ? `Read state: ${r.state}; unavailable data is not proof of a missing submission.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return packet(data, text, { submissionStatus: r.state }, r.warnings);
}
