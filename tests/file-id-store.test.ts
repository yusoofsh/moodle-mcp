import { expect, it } from "bun:test";
import { FileIdStore } from "../src/file-id-store.js";
const ref = {
  userId: 42,
  courseId: 10,
  fileurl: "https://moodle.example/pluginfile.php/x.pdf",
  mime: "application/pdf",
  filename: "x.pdf",
  filesize: 10,
};
it("round trips an opaque file ID for its owner", async () => {
  const store = new FileIdStore("test-key");
  const id = await store.seal(ref);
  expect(id).not.toContain("moodle.example");
  expect(await store.open(id, 42)).toEqual(ref);
});
it("rejects tampered ciphertext", async () => {
  const store = new FileIdStore("test-key");
  const id = await store.seal(ref);
  const altered = id.slice(0, 25) + (id[25] === "A" ? "B" : "A") + id.slice(26);
  expect(await store.open(altered, 42)).toBeNull();
});
it("rejects another user or a rotated Moodle token", async () => {
  const store = new FileIdStore("test-key");
  const id = await store.seal(ref);
  expect(await store.open(id, 99)).toBeNull();
  expect(await new FileIdStore("new-key").open(id, 42)).toBeNull();
});
it("rejects expired IDs and malformed input", async () => {
  const store = new FileIdStore("test-key", -1);
  expect(await store.open(await store.seal(ref), 42)).toBeNull();
  expect(await store.open("not-a-file-id", 42)).toBeNull();
});
