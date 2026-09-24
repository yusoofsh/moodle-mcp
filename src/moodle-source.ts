import type { MoodleClient } from "./moodle-client.js";

/** Remote discovery accepts a factory; an already connected stdio client still works. */
export type MoodleClientSource = MoodleClient | (() => Promise<MoodleClient>);

export async function resolveMoodleClient(
  source: MoodleClientSource,
): Promise<MoodleClient> {
  if (typeof source !== "function") return source;
  try {
    return await source();
  } catch (error) {
    // Only our fixed validation messages are safe to surface. Never forward a
    // network exception, response body, URL, or credentials from a failed factory.
    const known = new Set([
      "Invalid Moodle token. Check your MOODLE_TOKEN value.",
      "Web services are not enabled on this Moodle server. Contact your IT department to enable them.",
      "Moodle did not return a valid user ID",
    ]);
    if (error instanceof Error && known.has(error.message))
      throw new Error(error.message);
    throw new Error(
      "Cannot connect to Moodle. Check MOODLE_URL, MOODLE_TOKEN, enabled Web Services, and upstream availability. MCP discovery remains available.",
    );
  }
}
