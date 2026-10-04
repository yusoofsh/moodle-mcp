import { readFileSync, writeFileSync } from 'node:fs';
const path = 'scripts/test-workers.mjs';
let source = readFileSync(path, 'utf8');
const before = `      assert.equal(
        tools.json.result.tools.length,
        Object.keys(TOOL_FUNCTIONS).length,
      );
      assert.ok(
        tools.json.result.tools.every((t) => t.annotations.readOnlyHint),
      );`;
const after = `      assert.deepEqual(
        new Set(tools.json.result.tools.map((tool) => tool.name)),
        new Set([...Object.keys(TOOL_FUNCTIONS), "moodle_settings_read", "moodle_settings_update"]),
      );
      assert.ok(
        tools.json.result.tools.every((tool) => tool.annotations.readOnlyHint === (tool.name !== "moodle_settings_update")),
      );`;
if (source.split(before).length !== 2) throw new Error('Expected the existing Worker catalog assertion');
source = source.replace(before, after).replace('MCP initialize, all 21 read-only tools, Moodle request', 'MCP initialize, original read tools, local settings and Moodle request');
const apiInventory = '        info.json.result.structuredContent.data.catalog.toolCount,\n        Object.keys(TOOL_FUNCTIONS).length,';
if (source.split(apiInventory).length !== 2) throw new Error('Expected the separate Moodle API inventory assertion');
source = source.replace(apiInventory, apiInventory.replace('Object.keys(TOOL_FUNCTIONS).length', '__MOODLE_API_TOOL_COUNT__'));
const count = 'Object.keys(TOOL_FUNCTIONS).length';
const remaining = source.split(count).length - 1;
if (remaining < 1 || source.includes(count + ' + 2')) throw new Error('Expected unchanged MCP discovery assertions');
console.log('Extending MCP discovery checks while retaining the Moodle API inventory:', remaining);
source = source.replaceAll(count, count + ' + 2').replace('__MOODLE_API_TOOL_COUNT__', count);
const marker = '  await check(\n    "authenticated URL resolution and batch resource enrichment stay read-only",';
if (source.split(marker).length !== 2) throw new Error('Expected the existing URL read boundary');
source = source.replace(marker, `  await check("private study settings persist between authenticated Worker requests", async () => {
    const read = () => rpc(granted.access_token, "tools/call", { name: "moodle_settings_read", arguments: {} });
    const original = await read();
    assert.equal(original.status, 200, original.text);
    assert.deepEqual(original.json.result.structuredContent.values, { daysAhead: 7, minutesPerDay: 45, courseId: 0 });
    const changed = await rpc(granted.access_token, "tools/call", { name: "moodle_settings_update", arguments: { set: { daysAhead: 14, minutesPerDay: 30 } } });
    assert.equal(changed.status, 200, changed.text);
    assert.deepEqual(changed.json.result.structuredContent.values, { daysAhead: 14, minutesPerDay: 30, courseId: 0 });
    assert.deepEqual((await read()).json.result.structuredContent.values, { daysAhead: 14, minutesPerDay: 30, courseId: 0 });
    const denied = await rpc(granted.access_token, "tools/call", { name: "moodle_settings_update", arguments: { set: { owner: "other" } } });
    assert.ok(denied.json.error || denied.json.result?.isError);
    assert.deepEqual((await read()).json.result.structuredContent.values, { daysAhead: 14, minutesPerDay: 30, courseId: 0 });
    for (const text of [original.text, changed.text, denied.text]) assert.ok(!text.includes(bindings.MOODLE_TOKEN));
  });
` + marker);
writeFileSync(path, source);
