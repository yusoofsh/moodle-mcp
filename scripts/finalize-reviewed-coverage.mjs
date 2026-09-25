import fs from "node:fs/promises";
// One-time development application of locally tested source changes; never run by the Worker.
async function update(path, transform) {
  const source = await fs.readFile(path, "utf8");
  const output = transform(source);
  if (output !== source) await fs.writeFile(path, output);
}
await update("src/student/safe-api.ts", (s) => {
  if (s.includes("ACTIVITY_READS")) return s;
  s =
    'import { ACCOUNT_READS } from "./account-reads.js";\nimport { ACTIVITY_READS } from "./activity-reads.js";\n' +
    s;
  s = s
    .replace(
      "  moduleType?: string;",
      "  instanceType?: string;\n  moduleType?: string;",
    )
    .replace(
      "Object.freeze(READ_OPERATIONS);",
      "Object.assign(READ_OPERATIONS, ACTIVITY_READS, ACCOUNT_READS);\nObject.freeze(READ_OPERATIONS);",
    );
  const pos = s.indexOf(
    "  const response = await readApi(",
    s.indexOf("export async function invokeReadOperation"),
  );
  if (pos < 0) throw new Error("Unexpected adapter structure");
  s =
    s.slice(0, pos) +
    `  if (functionName === "mod_chat_get_session_messages" &&
      (Number(args.to) <= Number(args.from) || Number(args.to) - Number(args.from) > 7*86400 || Number(args.to) > Math.floor(Date.now()/1000)))
    throw new Error("Historical chat range must be in the past and at most seven days.");
  if (spec.instanceType) {
    const found = modules.filter(m=>m.id===args.moduleId && m.modname===spec.instanceType);
    if(found.length!==1)throw new Error("The selected activity type is not uniquely visible in this course.");
    let instanceId=found[0].instance;
    if(instanceId===undefined){
      const lookup=await readApi(client,"core_course_get_course_module",{cmid:args.moduleId},z.object({cm:z.object({id:idSchema,course:idSchema,modname:z.string(),instance:idSchema})}));
      const cm=lookup.value?.cm;
      if(!cm||cm.id!==args.moduleId||cm.course!==args.courseId||cm.modname!==spec.instanceType)throw new Error("Could not verify activity instance identity.");
      instanceId=cm.instance;
    }
    args._resolvedInstanceId=instanceId;
  }
` +
    s.slice(pos);
  s = s.replace("{cmid:args.moduleId}", "{cmid:args.moduleId as number}");
  s = s.replace(
    'purpose: "Competencies associated with a visible course",\n    params: courseParams,',
    'purpose: "Competencies associated with a visible course",\n    params: (_c,a) => ({id:a.courseId as number}),',
  );
  s = s.replaceAll(
    'courseid: value(a, "courseId", 0),\n    }),',
    '...(typeof a.courseId === "number" ? {courseid:a.courseId} : {}),\n    }),',
  );
  return s;
});
await update("src/student/result.ts", (s) => {
  if (s.includes("upstreamCode?: string;")) return s;
  s = s.replace(
    "export interface ReadWarning {",
    "export interface ReadWarning {\n  upstreamCode?: string;",
  );
  s = s.replace(
    "cmid: z.number().optional(),",
    "cmid: z.number().optional(),\n        upstreamCode: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(),",
  );
  const old = `        warning(
          "READ_" + state.toUpperCase(),
          "Moodle could not provide this read result (" +
            state +
            "). Permission, configuration, or connectivity may need attention.",
          api,
        ),`;
  if (!s.includes(old)) throw new Error("Unexpected error envelope");
  return s.replace(
    old,
    `        {...warning("READ_" + state.toUpperCase(), "Moodle could not provide this read result (" + state + "). Permission, configuration, or connectivity may need attention.", api), ...(error instanceof MoodleApiError ? {upstreamCode:error.code} : {})},`,
  );
});
await update("src/tools/coverage.ts", (s) => {
  const a = s.indexOf("export const COVERAGE_REQUIREMENTS"),
    b = s.indexOf("export function registerCoverageTools", a);
  if (a < 0) return s;
  return (s.slice(0, a) + s.slice(b))
    .replace("  TOOL_FUNCTIONS,\n", "")
    .replace("  TOOL_OPTIONAL_FUNCTIONS,\n", "");
});
await update("src/tools/quiz-review.ts", (s) => {
  const a = s.indexOf("TOOL_FUNCTIONS.moodle_get_quiz_review"),
    b = s.indexOf("export function registerQuizReviewTools", a);
  if (a < 0) return s;
  return (s.slice(0, a) + s.slice(b))
    .replace("  TOOL_FUNCTIONS,\n", "")
    .replace("  TOOL_OPTIONAL_FUNCTIONS,\n", "");
});
await update("src/student/insights.ts", (s) => {
  if (s.includes("outsideLookahead")) return s;
  s = s.replace(
    "  const counts = Object.fromEntries(",
    `  const windowEnd=now+(options.daysAhead??30)*86400;
  const listedTasks=tasks.filter(task=>!["upcoming","due_soon"].includes(task.state)||task.effectiveDueDate===null||task.effectiveDueDate<=windowEnd);
  const outsideLookahead=tasks.length-listedTasks.length;
  const counts = Object.fromEntries(`,
  );
  s = s
    .replaceAll(
      "tasks.filter((t) => t.state === key).length",
      "listedTasks.filter((t) => t.state === key).length",
    )
    .replace(
      "    items: tasks,\n    counts,",
      "    items: listedTasks,\n    counts,\n    lookahead:{daysAhead:options.daysAhead??30,until:windowEnd,untilIso:iso(windowEnd),outsideLookaheadInCheckedPage:outsideLookahead},",
    )
    .replaceAll("tasks\n        .map(", "listedTasks\n        .map(");
  return s;
});
await update("src/tools/download.ts", (s) => {
  const old =
    '        if (mode !== "raw")\n          return toolResult(await readDocument(client, fileId, options));';
  if (!s.includes(old)) return s;
  return s
    .replace(
      old,
      `        let extracted;
        if(mode!=="raw"){
          extracted=await readDocument(client,fileId,options);
          if(extracted.data.document.status!=="unsupported")return toolResult(extracted);
        }`,
    )
    .replace(
      "        return {\n          content: [",
      "        return {\n          ...(extracted?{structuredContent:{...extracted}}:{}),\n          content: [",
    );
});
for (const path of [
  ".github/workflows/publish.yml",
  ".github/workflows/workers-deploy.yml",
])
  await update(path, (s) =>
    s.includes("node scripts/test-document-runtime.mjs")
      ? s
      : s.replace(
          "      - run: bun run workers:build\n",
          "      - run: bun run workers:build\n      - run: node scripts/test-document-runtime.mjs\n",
        ),
  );
console.log(
  "Reviewed scope/diagnostic/compatibility changes applied. Full tests remain required.",
);
