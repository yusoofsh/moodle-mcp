/** Machine-readable error identity, separate from any upstream diagnostic text. */
export class MoodleApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MoodleApiError";
    this.code = /^[a-z0-9_]{1,64}$/.test(code) ? code : "unknown";
  }
}
