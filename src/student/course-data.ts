import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import {
  flagSchema,
  flag,
  idSchema,
  integer,
  iso,
  unix,
  readApi,
  type ReadWarning,
} from "./result.js";

export const completionSchema = z.object({
  state: z.number().int().optional(),
  timecompleted: z.number().int().optional(),
  istrackeduser: flagSchema.optional(),
  isoverallcomplete: flagSchema.optional(),
  uservisible: flagSchema.optional(),
  hascompletion: flagSchema.optional(),
  isautomatic: flagSchema.optional(),
  details: z
    .array(
      z.object({
        rulename: z.string(),
        rulevalue: z.object({
          status: z.number().int(),
          description: z.string(),
        }),
      }),
    )
    .optional(),
});
export const moduleSchema = z.object({
  id: idSchema,
  name: z.string(),
  modname: z.string(),
  instance: idSchema.optional(),
  uservisible: flagSchema.optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  availabilityinfo: z.string().optional(),
  completion: z.number().int().optional(),
  completiondata: z
    .union([completionSchema, z.array(z.unknown()).length(0)])
    .optional(),
  dates: z
    .array(
      z.object({
        label: z.string(),
        timestamp: z.number().int(),
        dataid: z.string().optional(),
      }),
    )
    .optional(),
});
export const sectionSchema = z.object({
  id: idSchema,
  name: z.string(),
  summary: z.string().optional(),
  uservisible: flagSchema.optional(),
  availabilityinfo: z.string().optional(),
  modules: z.array(moduleSchema),
});
export const sectionsSchema = z.array(sectionSchema);
export type ModuleData = z.infer<typeof moduleSchema>;
export type SectionData = z.infer<typeof sectionSchema>;
export const visible = (value: { uservisible?: boolean | number }) =>
  flag(value.uservisible) !== false;
export async function loadSections(
  client: MoodleClient,
  courseId: number,
): Promise<{ sections: SectionData[]; warnings: ReadWarning[] }> {
  const r = await readApi(
    client,
    "core_course_get_contents",
    { courseid: courseId },
    sectionsSchema,
  );
  if (!r.value)
    throw new Error(
      "Course contents could not be read (" +
        r.state +
        "). No course permissions were assumed.",
    );
  return {
    sections: r.value
      .filter(visible)
      .map((s) => ({ ...s, modules: s.modules.filter(visible) })),
    warnings: r.warnings,
  };
}
export function completionFor(
  module: ModuleData,
  value?: z.infer<typeof completionSchema>,
  tracking?: number,
  source = "core_course_get_contents",
) {
  const mode = integer(tracking ?? module.completion),
    data =
      value ??
      (Array.isArray(module.completiondata)
        ? undefined
        : module.completiondata);
  const trackedUser = flag(data?.istrackeduser),
    raw = integer(data?.state);
  const state = raw !== null && [0, 1, 2, 3].includes(raw) ? raw : null;
  const notTracked =
    mode === 0 || trackedUser === false || flag(data?.hascompletion) === false;
  const complete = notTracked
    ? null
    : (flag(data?.isoverallcomplete) ?? (state === null ? null : state > 0));
  return {
    tracking: mode !== null && [0, 1, 2].includes(mode) ? mode : null,
    trackedUser,
    state: notTracked ? null : state,
    status: notTracked
      ? "not_tracked"
      : state === null
        ? "unknown"
        : (
            [
              "incomplete",
              "complete",
              "complete_pass",
              "complete_fail",
            ] as const
          )[state],
    completed: complete,
    timeCompleted:
      state !== null && state > 0 ? unix(data?.timecompleted) : null,
    timeCompletedIso:
      state !== null && state > 0 ? iso(data?.timecompleted) : null,
    source: data ? source : null,
    rules: (data?.details ?? []).map((d) => ({
      name: d.rulename,
      state: d.rulevalue.status,
      description: d.rulevalue.description,
    })),
  };
}
export function activityFor(
  client: MoodleClient,
  courseId: number,
  section: SectionData,
  module: ModuleData,
) {
  return {
    courseId,
    sectionId: section.id,
    sectionName: section.name,
    cmid: module.id,
    instanceId: module.instance ?? null,
    moduleType: module.modname,
    name: module.name,
    url:
      client.siteUrl +
      "/mod/" +
      encodeURIComponent(module.modname) +
      "/view.php?id=" +
      module.id,
    availability: {
      accessible: true,
      reported: flag(module.uservisible),
      informationHtml: module.availabilityinfo ?? null,
    },
    completion: completionFor(module),
  };
}
export function summarizeActivities(
  items: { completion: ReturnType<typeof completionFor> }[],
) {
  const all = items.map((i) => i.completion),
    tracked = all.filter(
      (c) =>
        [1, 2].includes(c.tracking ?? -1) &&
        c.trackedUser !== false &&
        c.status !== "not_tracked",
    );
  const completed = tracked.filter((c) => c.completed === true).length,
    incomplete = tracked.filter((c) => c.completed === false).length,
    unknown = tracked.filter((c) => c.completed === null).length;
  const unknownTracking = all.filter(
    (c) =>
      c.tracking === null &&
      c.trackedUser !== false &&
      c.status !== "not_tracked",
  ).length;
  return {
    visibleActivities: all.length,
    tracked: tracked.length,
    notTracked: all.filter((c) => c.status === "not_tracked").length,
    unknownTracking,
    completed,
    incomplete,
    unknown,
    failed: tracked.filter((c) => c.state === 3).length,
    percentComplete:
      tracked.length && !unknown && !unknownTracking
        ? Math.round((completed / tracked.length) * 10000) / 100
        : null,
    basis:
      "Current visible tracked activities only; not the Moodle course-completion decision.",
  };
}
