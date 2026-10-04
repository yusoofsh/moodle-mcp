import { readFileSync, writeFileSync } from 'node:fs';
function replace(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (source.split(before).length !== 2) throw new Error('Expected one reviewed edit in ' + path);
  writeFileSync(path, source.replace(before, after));
}
replace('src/tools/content.ts', 'import { z } from "zod";', 'import { studyHubMetadata } from "../ui/study-hub.js";\nimport { z } from "zod";');
replace('src/tools/content.ts', 'outputSchema: contentOutputs.moodle_get_dashboard,\n        annotations: READ_ONLY,\n        _meta: AUTH_META,', 'outputSchema: contentOutputs.moodle_get_dashboard,\n        annotations: READ_ONLY,\n        _meta: { ...AUTH_META, ...studyHubMetadata },');
replace('src/resources/index.ts', 'import { McpServer, ResourceTemplate }', 'import { registerStudyHub } from "../ui/study-hub.js";\nimport { McpServer, ResourceTemplate }');
replace('src/resources/index.ts', 'export function registerResources(\n  server: McpServer,\n  source: MoodleClientSource,\n): void {', 'export function registerResources(\n  server: McpServer,\n  source: MoodleClientSource,\n): void {\n  registerStudyHub(server);');
replace('tests/tool-policy.test.ts', 'registerResource.mock.calls[0][3]', 'registerResource.mock.calls.find(([name]) => name === "moodle-course-files")![3]');
