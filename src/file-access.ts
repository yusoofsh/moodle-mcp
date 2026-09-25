import type { MoodleClient } from "./moodle-client.js";
import type { FileRef } from "./file-id-store.js";
interface ModuleContent {
  type: string;
  fileurl: string;
}

interface CourseModule {
  uservisible?: boolean | number;
  contents?: ModuleContent[];
}

interface CourseSection {
  uservisible?: boolean | number;
  modules: CourseModule[];
}

export async function reauthorize(
  client: MoodleClient,
  ref: FileRef,
): Promise<boolean> {
  try {
    const sections = await client.call<CourseSection[]>(
      "core_course_get_contents",
      {
        courseid: ref.courseId,
      },
    );
    for (const section of sections) {
      if (section.uservisible === false || section.uservisible === 0) continue;
      for (const mod of section.modules) {
        if (mod.uservisible === false || mod.uservisible === 0) continue;
        for (const file of mod.contents ?? []) {
          if (file.type === "file" && file.fileurl === ref.fileurl) return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}
