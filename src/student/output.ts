import { z } from "zod";
import { idSchema, readOutputSchema, readStates } from "./result.js";
const n = z.number().nullable(),
  s = z.string().nullable(),
  b = z.boolean().nullable();
const completion = z.object({
  tracking: n,
  trackedUser: b,
  state: n,
  status: z.string(),
  completed: b,
  timeCompleted: n,
  timeCompletedIso: s,
  source: s,
  rules: z.array(
    z.object({ name: z.string(), state: z.number(), description: z.string() }),
  ),
});
const activity = z
  .object({
    courseId: idSchema,
    sectionId: idSchema,
    sectionName: z.string(),
    cmid: idSchema,
    instanceId: n,
    moduleType: z.string(),
    name: z.string(),
    url: z.string(),
    availability: z.object({
      accessible: z.boolean(),
      reported: b,
      informationHtml: s,
    }),
    completion,
  })
  .passthrough();
const summary = z.object({
  visibleActivities: z.number(),
  tracked: z.number(),
  notTracked: z.number(),
  unknownTracking: z.number(),
  completed: z.number(),
  incomplete: z.number(),
  unknown: z.number(),
  failed: z.number(),
  percentComplete: n,
  basis: z.string(),
});
const assignment = z.object({
  courseId: idSchema,
  sectionId: idSchema,
  sectionName: z.string(),
  cmid: idSchema,
  instanceId: n,
  assignmentId: n,
  moduleType: z.string(),
  name: z.string(),
  url: z.string(),
  detailsStatus: z.string(),
  dueDate: n,
  dueDateIso: s,
  dueDateState: z.string(),
  openDate: n,
  openDateIso: s,
  cutoffDate: n,
  cutoffDateIso: s,
  grade: z.object({ type: z.string(), maximum: n, scaleId: n }).nullable(),
  submissionsEnabled: b,
  draftsEnabled: b,
  teamSubmission: b,
  deadlineSource: s,
});
const api = z.object({ name: z.string(), advertisement: z.enum(readStates) });
export const studentOutputs = {
  moodle_list_assignments: readOutputSchema.extend({
    data: z.object({ courseId: idSchema, items: z.array(assignment) }),
  }),
  moodle_get_assignment: readOutputSchema.extend({
    data: z.object({
      assignmentId: idSchema,
      userId: idSchema,
      readStatus: z.enum(readStates),
      submissionStatus: z.string(),
      submissionKind: s,
      lastModified: n,
      lastModifiedIso: s,
      attemptNumber: n,
      graded: b,
      gradingStatus: s,
      submissionsEnabled: b,
      locked: b,
      canEditInMoodle: b,
      canSubmitInMoodle: b,
      bridgeCanSubmit: z.boolean(),
      extensionDueDate: n,
      extensionDueDateIso: s,
      feedback: z
        .object({ grade: s, display: s, gradedDate: n, gradedDateIso: s })
        .nullable(),
    }),
  }),
  moodle_get_activity_completion: readOutputSchema.extend({
    data: z.object({
      courseId: idSchema,
      userId: idSchema,
      items: z.array(activity),
      summary,
    }),
  }),
  moodle_get_course_completion: readOutputSchema.extend({
    data: z.object({
      courseId: idSchema,
      userId: idSchema,
      completed: b,
      aggregation: s,
      criteria: z
        .array(
          z.object({
            type: z.number(),
            title: z.string(),
            displayStatus: z.string(),
            completed: b,
            timeCompleted: n,
            timeCompletedIso: s,
            details: z
              .object({
                type: z.string(),
                criteria: z.string(),
                requirement: z.string(),
                status: z.string(),
              })
              .nullable(),
          }),
        )
        .nullable(),
    }),
  }),
  moodle_get_attendance: readOutputSchema.extend({
    data: z.object({
      courseId: idSchema,
      userId: idSchema,
      activities: z.array(activity),
      sessions: z
        .array(
          z.object({
            sessionId: idSchema,
            cmid: idSchema,
            instanceId: idSchema,
            courseId: idSchema,
            userId: idSchema,
            startDate: n,
            startDateIso: s,
            durationSeconds: z.number(),
            status: z.string(),
            statusId: n,
            statusLabel: s,
            acronym: s,
            remarks: s,
            canMarkThroughMcp: z.boolean(),
          }),
        )
        .nullable(),
    }),
  }),
  moodle_list_courses: readOutputSchema.extend({
    data: z.object({
      userId: idSchema,
      items: z
        .array(
          z.object({
            courseId: idSchema,
            name: z.string(),
            shortName: z.string(),
            url: z.string(),
            startDate: n,
            startDateIso: s,
            endDate: n,
            endDateIso: s,
            completionEnabled: b,
            progressPercent: n,
            completed: b,
          }),
        )
        .nullable(),
    }),
  }),
  moodle_get_course: readOutputSchema.extend({
    data: z.object({
      courseId: idSchema,
      items: z.array(
        activity.extend({
          descriptionHtml: s,
          dates: z.array(
            z.object({ label: z.string(), unix: n, iso: s, dataId: s }),
          ),
        }),
      ),
      activityCompletion: summary,
      attendanceActivityCount: z.number(),
    }),
  }),
  moodle_get_site_info: readOutputSchema.extend({
    data: z.object({
      school: z.string(),
      version: z.string(),
      userId: idSchema,
      reportedFunctionCount: n,
      advertisedFunctions: z.array(z.string()),
      catalog: z.object({
        version: z.string(),
        toolCount: z.number(),
        tools: z.array(
          z.object({
            name: z.string(),
            required: z.array(api),
            optional: z.array(api),
            permissionChecked: z.boolean(),
          }),
        ),
        registryNote: z.string(),
      }),
      attendance: z.object({
        advertisedFunctions: z.array(z.string()),
        sessionReadApi: z.string(),
        sessionsRead: z.enum(readStates),
        mobileReadFallback: z.boolean(),
        reason: z.string(),
      }),
    }),
  }),
};

export { activity as activityOutputSchema, summary as activitySummarySchema };
