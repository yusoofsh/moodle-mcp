import { readFileSync, writeFileSync } from 'node:fs';
function patch(path, before, after) {
  const current = readFileSync(path, 'utf8');
  if (current.split(before).length !== 2) throw new Error('Expected one reviewed change in ' + path);
  writeFileSync(path, current.replace(before, after));
}
patch('src/register-tools.ts', 'import { registerStudyPlan }', 'import { registerStudySettings, type StudyPreferenceStore } from "./workflows/settings.js";\nimport { registerStudyPlan }');
patch('src/register-tools.ts', '  client: MoodleClientSource,\n): void {', '  client: MoodleClientSource,\n  preferences?: StudyPreferenceStore,\n): void {');
patch('src/register-tools.ts', '  registerStudyPlan(server, client);', '  if (preferences) registerStudySettings(server, preferences);\n  registerStudyPlan(server, client, preferences?.read);');
patch('src/app-core.ts', 'import express,', 'import { studyPreferenceStore } from "./workflows/settings.js";\nimport express,');
patch('src/app-core.ts', '    registerAllTools(server, getClient);', '    registerAllTools(server, getClient, studyPreferenceStore(store, config.ownerId));');
patch('src/workflows/study-plan.ts', 'import { inputRequired,', 'import type { StudyPreferences } from "./settings.js";\nimport { inputRequired,');
patch('src/workflows/study-plan.ts', '  source: MoodleClientSource,\n) {', '  source: MoodleClientSource,\n  readPreferences?: () => StudyPreferences,\n) {');
patch('src/workflows/study-plan.ts', '        return inputRequired({', '        const preferences = readPreferences?.();\n        return inputRequired({');
patch('src/workflows/study-plan.ts', '                    title: "Days ahead",', '                    title: "Days ahead",\n                    ...(preferences ? { default: args.daysAhead ?? preferences.daysAhead } : {}),');
patch('src/workflows/study-plan.ts', '                    title: "Study minutes per day",', '                    title: "Study minutes per day",\n                    ...(preferences ? { default: args.minutesPerDay ?? preferences.minutesPerDay } : {}),');
patch('src/workflows/study-plan.ts', '                    title: "Course ID, or 0 for enrolled courses",', '                    title: "Course ID, or 0 for enrolled courses",\n                    ...(preferences ? { default: args.courseId ?? preferences.courseId } : {}),');
const path = 'tests/discovery-http.test.ts';
let test = readFileSync(path, 'utf8');
if (test.split('Object.keys(TOOL_FUNCTIONS).length,').length !== 3) throw new Error('Expected both existing catalog assertions');
test = test.replaceAll('Object.keys(TOOL_FUNCTIONS).length,', 'Object.keys(TOOL_FUNCTIONS).length + 2,');
test = test.replace('      expect(tool.annotations.readOnlyHint).toBe(true);', '      expect(tool.annotations.readOnlyHint).toBe(tool.name !== "moodle_settings_update");');
test = test.replace('    for (const tool of list.body.result.tools) {', '    expect(new Set(list.body.result.tools.map((tool: { name: string }) => tool.name))).toEqual(new Set([...Object.keys(TOOL_FUNCTIONS), "moodle_settings_read", "moodle_settings_update"]));\n    for (const tool of list.body.result.tools) {');
writeFileSync(path, test);
