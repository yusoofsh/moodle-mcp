import { Buffer } from "node:buffer";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt:131072:8:1";
const FORMAT =
  /^(scrypt:131072:8:1|scrypt:32768:8:3):([a-f0-9]{32}):([a-f0-9]{64})$/;
export const WORKERS_PASSWORD_PREFIX = "scrypt:32768:8:3";
export const MAX_PASSWORD_BYTES = 1024;
// OWASP scrypt profile; explicitly exceed Node's 32 MiB default maxmem.
const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };

export function validatePasswordHash(encoded: string): void {
  if (!FORMAT.test(encoded)) {
    throw new Error(
      "AUTH_PASSWORD_HASH must be generated with the password:hash command",
    );
  }
}
function derive(
  password: string,
  salt: Buffer,
  profile = PREFIX,
): Promise<Buffer> {
  const input = Buffer.from(password, "utf8");
  return new Promise((resolve, reject) => {
    scrypt(
      input,
      salt,
      32,
      profile === WORKERS_PASSWORD_PREFIX
        ? { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 }
        : OPTIONS,
      (error, key) => {
        input.fill(0);
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
export async function hashPassword(
  password: string,
  workers = false,
): Promise<string> {
  if (
    [...password].length < 15 ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES ||
    /[\r\n\0]/.test(password)
  ) {
    throw new Error(
      "Use a passphrase of at least 15 characters and at most 1024 UTF-8 bytes, without line breaks or NUL",
    );
  }
  const salt = randomBytes(16);
  const prefix = workers ? WORKERS_PASSWORD_PREFIX : PREFIX;
  const key = await derive(password, salt, prefix);
  try {
    return `${prefix}:${Buffer.from(salt).toString("hex")}:${Buffer.from(key).toString("hex")}`;
  } finally {
    key.fill(0);
  }
}
export async function verifyPassword(
  password: unknown,
  encoded: string,
): Promise<boolean> {
  validatePasswordHash(encoded);
  if (
    typeof password !== "string" ||
    !password ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
  )
    return false;
  const [, prefix, salt, expected] = FORMAT.exec(encoded)!;
  const actual = await derive(password, Buffer.from(salt, "hex"), prefix);
  try {
    return timingSafeEqual(actual, Buffer.from(expected, "hex"));
  } finally {
    actual.fill(0);
  }
}
