import { readFileSync, writeFileSync } from 'node:fs';
function replace(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (source.split(before).length !== 2) throw new Error('Reviewed source no longer matches: ' + path);
  writeFileSync(path, source.replace(before, after));
}
replace('src/register-tools.ts', '  registerCourseTools(server, client);', '  registerWorkflowMethods(server);\n  registerStudyPlan(server, client);\n  registerCourseTools(server, client);');
replace('src/register-tools.ts', 'import { registerQuizReviewTools }', 'import { registerStudyPlan } from "./workflows/study-plan.js";\nimport { registerWorkflowMethods } from "./workflows/methods.js";\nimport { registerQuizReviewTools }');
replace('src/resources/index.ts', '  registerStudyHub(server);', '  registerStudyHub(server);\n  registerWorkflowResources(server);\n  registerMaterialResources(server, source);');
replace('src/resources/index.ts', 'import { reauthorize }', 'import { registerMaterialResources } from "../workflows/material-resources.js";\nimport { registerWorkflowResources } from "../workflows/resources.js";\nimport { reauthorize }');
replace('src/tool-policy.ts', 'export const TOOL_FUNCTIONS: Record<string, readonly string[]> = {', 'export const TOOL_FUNCTIONS: Record<string, readonly string[]> = {\n  moodle_plan_study: ["core_enrol_get_users_courses", "mod_assign_get_assignments", "mod_assign_get_submission_status"],');
replace('tests/discovery.test.ts', '(await client.listResourceTemplates()).resourceTemplates.length,\n    ).toBe(1);', '(await client.listResourceTemplates()).resourceTemplates.length,\n    ).toBe(3);');
replace('tests/discovery.test.ts', '(await client.listResourceTemplates()).resourceTemplates,\n    ).toHaveLength(1);', '(await client.listResourceTemplates()).resourceTemplates.map(t => t.uriTemplate),\n    ).toEqual(expect.arrayContaining(["moodle://files/{fileId}", "moodle://study-manifest/{courseId}", "moodle://activity/{courseId}/{cmid}"]));');
replace('src/ui/bridge.ts', 'function applyContext(context){', 'function applyContext(context){if(context?.["openai/deepLink"]&&typeof onDeepLink==="function")onDeepLink(context["openai/deepLink"]);');
replace('src/ui/study-hub.ts', 'import type { McpServer }', 'import { appRoute } from "./deep-link.js";\nimport type { McpServer }');
replace('src/ui/study-hub.ts', "const appName='moodle-study-hub';", "const appName='moodle-study-hub';\nconst appRoute=${String(appRoute)};let requestedCourse=null;");
replace('src/ui/study-hub.ts', "function onReady(){if(!hasSnapshot)refresh('overview');}", "function onDeepLink(value){const route=appRoute(value);if(route?.kind==='course'){requestedCourse=Number(route.id);if(ready&&!busy)void load('overview',{courseId:requestedCourse,daysAhead:7,maxCourses:1,eventLimit:20});}}\nfunction onReady(){if(requestedCourse)void load('overview',{courseId:requestedCourse,daysAhead:7,maxCourses:1,eventLimit:20});else if(!hasSnapshot)refresh('overview');}");
