import fs from "node:fs/promises";
const target = "src/generated/moodle-api-declarations.ts";
const current = await fs.readFile(target, "utf8").catch(() => "");
if (current && !current.includes("pending-generation")) process.exit(0);
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "moodle-mcp-contract-index",
};
const commitResponse = await fetch(
  "https://api.github.com/repos/moodle/moodle/commits/MOODLE_405_STABLE",
  { headers },
);
if (!commitResponse.ok)
  throw new Error("Could not resolve official Moodle 4.5 source revision");
const revision = (await commitResponse.json()).sha;
if (!/^[a-f0-9]{40}$/.test(revision))
  throw new Error("Invalid source revision");
const modules = [
  "assign",
  "bigbluebuttonbn",
  "book",
  "chat",
  "choice",
  "data",
  "feedback",
  "folder",
  "forum",
  "glossary",
  "h5pactivity",
  "imscp",
  "label",
  "lesson",
  "lti",
  "page",
  "quiz",
  "resource",
  "scorm",
  "survey",
  "url",
  "wiki",
  "workshop",
];
const paths = [
  "lib/db/services.php",
  ...modules.map((name) => `mod/${name}/db/services.php`),
];
const declarations = {};
for (const path of paths) {
  const response = await fetch(
    `https://raw.githubusercontent.com/moodle/moodle/${revision}/${path}`,
  );
  if (!response.ok)
    throw new Error("Missing official declaration file " + path);
  const source = await response.text();
  const matches = [
    ...source.matchAll(
      /['"]((?:core|mod|tool|gradereport|message|report)_[a-z0-9_]+)['"]\s*=>\s*(?:array\(|\[)/g,
    ),
  ];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i],
      block = source.slice(
        m.index + m[0].length,
        matches[i + 1]?.index ?? source.length,
      ),
      type =
        /['"]type['"]\s*=>\s*['"](read|write)['"]/.exec(block)?.[1] ??
        "unknown";
    if (Object.hasOwn(declarations, m[1]))
      throw new Error("Duplicate declaration " + m[1]);
    declarations[m[1]] = { type, source: path };
  }
}
if (Object.keys(declarations).length < 500)
  throw new Error("Incomplete API declaration inventory");
const entries = Object.fromEntries(
  Object.entries(declarations).sort(([a], [b]) => a.localeCompare(b)),
);
await fs.mkdir("src/generated", { recursive: true });
await fs.writeFile(
  target,
  `// Function names/types are reference metadata, not an execution allowlist.\n// Source: https://github.com/moodle/moodle/tree/${revision} (Moodle 4.5 stable).\nexport const SOURCE_REVISION=${JSON.stringify(revision)};\nexport const MOODLE_DECLARATIONS:Record<string,{type:'read'|'write'|'unknown';source:string}>=${JSON.stringify(entries, null, 2)};\n`,
);
console.log(
  JSON.stringify({
    sourceRevision: revision,
    declarationCount: Object.keys(entries).length,
  }),
);
