import type { MoodleClient } from "./moodle-client.js";

export interface UrlModule {
  id: number;
  name: string;
  modname: string;
  instance?: number;
  uservisible?: boolean | number;
  url?: string;
  contents?: {
    type: string;
    fileurl: string;
    filename?: string;
    filesize?: number;
    mimetype?: string;
  }[];
}
export interface UrlSection {
  id: number;
  name: string;
  uservisible?: boolean | number;
  modules: UrlModule[];
}
interface MoodleUrl {
  id: number;
  coursemodule: number;
  course: number;
  externalurl: unknown;
  uservisible?: boolean | number;
}
export interface ResolvedUrl {
  moduleId: number;
  courseId: number;
  name: string;
  activityUrl: string;
  externalurl: string | null;
  resolved: boolean;
  source: "mod_url_get_urls_by_courses" | "core_course_get_contents" | null;
  reason:
    | "api_unavailable"
    | "not_returned"
    | "unsafe_target"
    | "ambiguous_target"
    | null;
}
export const isUserVisible = (item: {
  uservisible?: boolean | number;
}): boolean => item.uservisible !== false && item.uservisible !== 0;

/** Validate metadata only. This module never fetches or follows the destination. */
export function safeExternalUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    !/^https?:\/\//i.test(value) ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      !["https:", "http:"].includes(url.protocol)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function isActivityWrapper(url: string, site: string): boolean {
  const target = new URL(url),
    root = new URL(site);
  return (
    target.origin === root.origin &&
    target.pathname === root.pathname.replace(/\/$/, "") + "/mod/url/view.php"
  );
}
function positiveId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/** One course-scoped optional lookup, joined by coursemodule (not URL instance id). */
export async function resolveCourseUrls(
  client: MoodleClient,
  courseId: number,
  sections: UrlSection[],
): Promise<Map<number, ResolvedUrl>> {
  const modules = sections
    .filter(isUserVisible)
    .flatMap((s) => s.modules)
    .filter((m) => isUserVisible(m) && m.modname === "url");
  const results = new Map<number, ResolvedUrl>();
  if (!modules.length) return results;
  let urls: MoodleUrl[] = [],
    available = false;
  if (client.supports("mod_url_get_urls_by_courses")) {
    try {
      const response = await client.call<{ urls: MoodleUrl[] }>(
        "mod_url_get_urls_by_courses",
        { "courseids[0]": courseId },
      );
      if (Array.isArray(response?.urls)) {
        urls = response.urls;
        available = true;
      }
    } catch {
      /* Optional enrichment must not hide the existing course files. */
    }
  }
  for (const module of modules) {
    const result: ResolvedUrl = {
      moduleId: module.id,
      courseId,
      name: module.name,
      activityUrl: client.siteUrl + "/mod/url/view.php?id=" + module.id,
      externalurl: null,
      resolved: false,
      source: null,
      reason: available ? "not_returned" : "api_unavailable",
    };
    const rows = urls.filter(
      (u) =>
        u &&
        u.course === courseId &&
        u.coursemodule === module.id &&
        (module.instance === undefined || u.id === module.instance),
    );
    if (rows.length > 1) {
      result.reason = "ambiguous_target";
    } else if (rows.length === 1) {
      // An explicitly inaccessible API row is not overridden with another source.
      if (isUserVisible(rows[0])) {
        const target = safeExternalUrl(rows[0].externalurl);
        if (target && !isActivityWrapper(target, client.siteUrl)) {
          result.externalurl = target;
          result.source = "mod_url_get_urls_by_courses";
        } else result.reason = "unsafe_target";
      }
    } else {
      // core_course_get_contents can independently expose exported URL content.
      // Never use module.url here: that is the Moodle activity wrapper.
      const targets = [
        ...new Set(
          (module.contents ?? [])
            .filter((c) => c.type === "url")
            .map((c) => safeExternalUrl(c.fileurl))
            .filter(
              (url): url is string =>
                url !== null && !isActivityWrapper(url, client.siteUrl),
            ),
        ),
      ];
      if (targets.length === 1) {
        result.externalurl = targets[0];
        result.source = "core_course_get_contents";
      } else if (targets.length > 1) result.reason = "ambiguous_target";
    }
    if (result.externalurl) {
      result.resolved = true;
      result.reason = null;
    }
    results.set(module.id, result);
  }
  return results;
}

export async function resolveUrl(
  client: MoodleClient,
  moduleId: number,
  courseId?: number,
): Promise<ResolvedUrl> {
  if (
    !positiveId(moduleId) ||
    (courseId !== undefined && !positiveId(courseId))
  )
    throw new Error("Use positive integer moduleId and courseId values.");
  if (courseId === undefined) {
    if (!client.supports("core_course_get_course_module"))
      throw new Error(
        "This token lacks core_course_get_course_module. Supply courseId from moodle_list_courses with moduleId.",
      );
    const { cm } = await client.call<{
      cm: { id: number; course: number; modname: string };
    }>("core_course_get_course_module", { cmid: moduleId });
    if (!cm || cm.id !== moduleId || !positiveId(cm.course))
      throw new Error("Moodle did not return the requested module.");
    if (cm.modname !== "url")
      throw new Error("This module is not a URL activity.");
    courseId = cm.course;
  }
  const sections = await client.call<UrlSection[]>("core_course_get_contents", {
    courseid: courseId,
  });
  const module = sections
    .filter(isUserVisible)
    .flatMap((s) => s.modules)
    .find((m) => m.id === moduleId && isUserVisible(m));
  if (!module)
    throw new Error(
      "This module is not visible to the current Moodle account in the requested course.",
    );
  if (module.modname !== "url")
    throw new Error("This module is not a URL activity.");
  const result = (
    await resolveCourseUrls(client, courseId, [
      { id: 0, name: "", modules: [module] },
    ])
  ).get(moduleId);
  if (!result)
    throw new Error("URL resolution did not return the requested activity.");
  return result;
}
