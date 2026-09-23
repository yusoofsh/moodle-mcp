import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { hashPassword, MAX_PASSWORD_BYTES } from "./password.js";

export async function readPasswordInput(
  input: AsyncIterable<Buffer | string>,
): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of input) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += value.length;
      if (bytes > MAX_PASSWORD_BYTES + 2)
        throw new Error("Password input exceeds 1024 bytes");
      chunks.push(value);
    }
    // Permit a single terminating LF/CRLF from a pipe; preserve all other spaces.
    return Buffer.concat(chunks)
      .toString("utf8")
      .replace(/\r?\n$/, "");
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}
async function hiddenPassword(): Promise<string> {
  const silent = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: silent,
    terminal: true,
  });
  const abort = new AbortController();
  rl.on("SIGINT", () => abort.abort());
  rl.on("close", () => abort.abort());
  const ask = async (label: string) => {
    process.stderr.write(label);
    const value = await rl.question("", { signal: abort.signal });
    process.stderr.write("\n");
    return value;
  };
  try {
    const password = await ask("New password (at least 15 characters): ");
    const confirm = await ask("Confirm password: ");
    if (password !== confirm) throw new Error("Passwords do not match");
    return password;
  } finally {
    rl.close();
    process.stderr.write("\n");
  }
}
export async function main(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    process.stdout.write(
      "Usage: node dist/auth/password-cli.js [--stdin]\nDefault: hidden terminal prompt with confirmation. --stdin: read one password from a pipe.\nThe password is never accepted as a command-line argument. Output is an AUTH_PASSWORD_HASH line for .env.\n",
    );
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--stdin"))
    throw new Error(
      "Only --stdin or --help is supported; never pass the password as an argument",
    );
  if (!args.length && !process.stdin.isTTY)
    throw new Error(
      "Use an interactive terminal (-it with Docker) or explicitly select --stdin",
    );
  const password =
    args[0] === "--stdin"
      ? await readPasswordInput(process.stdin)
      : await hiddenPassword();
  const hash = await hashPassword(password);
  // Colon encoding avoids Compose's dollar-sign interpolation in .env files.
  process.stdout.write(`AUTH_PASSWORD_HASH=${hash}\n`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    // These messages are local validation failures, never password contents.
    process.stderr.write(
      error instanceof Error && error.name === "AbortError"
        ? "Password entry cancelled\n"
        : `${error instanceof Error ? error.message : "Hash generation failed"}\n`,
    );
    process.exitCode = 1;
  });
}
