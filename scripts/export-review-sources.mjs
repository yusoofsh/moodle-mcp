import fs from "node:fs/promises";
import { SOURCE_REVISION } from "../dist/generated/moodle-api-declarations.js";
if (!/^[a-f0-9]{40}$/.test(SOURCE_REVISION))
  throw new Error("Pinned upstream source revision is unavailable");
const roots = [
  "choice",
  "data",
  "feedback",
  "glossary",
  "h5pactivity",
  "lesson",
  "scorm",
  "survey",
  "wiki",
  "workshop",
  "bigbluebuttonbn",
  "chat",
  "quiz",
];
const paths = [
  "message/externallib.php",
  "group/externallib.php",
  "enrol/externallib.php",
  "user/externallib.php",
  "calendar/externallib.php",
  "competency/classes/external.php",
  "admin/tool/lp/externallib.php",
  "blog/externallib.php",
  "search/classes/external.php",
  ...roots.map((m) => `mod/${m}/externallib.php`),
];
await fs.mkdir("offline-review/upstream", { recursive: true });
const results = [];
for (const path of paths) {
  let selected = path,
    response = await fetch(
      `https://raw.githubusercontent.com/moodle/moodle/${SOURCE_REVISION}/${selected}`,
    );
  if (response.status === 404 && selected.endsWith("/externallib.php")) {
    selected = selected.replace("/externallib.php", "/classes/external.php");
    response = await fetch(
      `https://raw.githubusercontent.com/moodle/moodle/${SOURCE_REVISION}/${selected}`,
    );
  }
  if (!response.ok) {
    results.push({ path, status: response.status });
    continue;
  }
  const text = await response.text();
  if (text.length > 2000000) throw new Error("Unexpectedly large source file");
  await fs.writeFile(
    "offline-review/upstream/" + selected.replaceAll("/", "__"),
    text,
  );
  results.push({ path: selected, status: 200 });
}
await fs.writeFile(
  "offline-review/source-revision.txt",
  SOURCE_REVISION + "\n",
);
console.log(
  JSON.stringify({ sourceRevision: SOURCE_REVISION, files: results }),
);
