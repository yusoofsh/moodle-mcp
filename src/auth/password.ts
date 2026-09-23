import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt:131072:8:1";
const FORMAT = /^scrypt:131072:8:1:([a-f0-9]{32}):([a-f0-9]{64})$/;
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
function derive(password: string, salt: Buffer): Promise<Buffer> {
  const input = Buffer.from(password, "utf8");
  return new Promise((resolve, reject) => {
    scrypt(input, salt, 32, OPTIONS, (error, key) => {
      input.fill(0);
      if (error) reject(error);
      else resolve(key);
    });
  });
}
export async function hashPassword(password: string): Promise<string> {
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
  const key = await derive(password, salt);
  try {
    return `${PREFIX}:${salt.toString("hex")}:${key.toString("hex")}`;
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
  const [, salt, expected] = FORMAT.exec(encoded)!;
  const actual = await derive(password, Buffer.from(salt, "hex"));
  try {
    return timingSafeEqual(actual, Buffer.from(expected, "hex"));
  } finally {
    actual.fill(0);
  }
}
