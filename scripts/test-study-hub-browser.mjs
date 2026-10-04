import assert from "node:assert/strict";
import { chromium } from "playwright";
import { studyHubHtml } from "../dist/ui/study-hub.js";

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      '<main><iframe id="app" title="Study Hub fixture" style="width:100%;height:800px;border:0"></iframe></main>',
    );
    await page.evaluate((html) => {
      window.reads = [];
      window.contextUpdates = [];
      const frame = document.querySelector("#app");
      window.addEventListener("message", (event) => {
        if (event.source !== frame.contentWindow) return;
        const request = event.data;
        if (!request?.id) return;
        let result = {};
        if (request.method === "ui/initialize")
          result = {
            protocolVersion: "2026-01-26",
            hostInfo: { name: "fixture", version: "1" },
            hostCapabilities: { updateModelContext: {} },
            hostContext: { theme: "light" },
          };
        else if (request.method === "ui/update-model-context")
          window.contextUpdates.push(request.params);
        else if (request.method === "tools/call") {
          window.reads.push(request.params);
          const tasks = request.params.name === "moodle_get_tasks";
          result = {
            content: [],
            structuredContent: {
              data: tasks
                ? {
                    items: [
                      {
                        name: "Fixture task",
                        courseName: "Fixture course",
                        state: "not_checked",
                        submissionStatus: "unknown",
                        effectiveDueDateIso: null,
                      },
                    ],
                    complete: false,
                    coverage: {
                      nextAssignmentOffset: request.params.arguments
                        .assignmentOffset
                        ? null
                        : 10,
                      nextCourseOffset: null,
                    },
                  }
                : {
                    courses: [
                      {
                        name: '<img src=x onerror="window.bad=true">',
                        activityProgress: { percentComplete: 25 },
                        reportedCourseCompleted: null,
                        readStatus: "partial",
                      },
                    ],
                    complete: false,
                    coverage: { coursePage: { nextOffset: null } },
                    timeline: { items: [], cursor: {} },
                  },
              warnings: [
                { message: "Fixture partial coverage remains explicit." },
              ],
            },
          };
        } else throw new Error("Unexpected host request: " + request.method);
        frame.contentWindow.postMessage(
          { jsonrpc: "2.0", id: request.id, result },
          "*",
        );
      });
      frame.srcdoc = html;
    }, studyHubHtml);
    const frame = page.frameLocator("#app");
    await frame.locator("#items .card").waitFor();
    assert.equal(await frame.locator("#items img").count(), 0);
    assert.match(
      await frame.locator("#coverage").innerText(),
      /Partial or unknown coverage/,
    );
    assert.equal((await page.evaluate(() => window.contextUpdates)).length, 0);
    await frame.locator("#items .card button").first().click();
    await frame.locator("#share").click();
    await page.waitForFunction(() => window.contextUpdates.length === 1);
    assert.match(
      (await page.evaluate(() => window.contextUpdates[0])).content[0].text,
      /Selected Moodle study item/,
    );
    await frame.locator("#tasks").click();
    await frame.locator("#items").getByText("Fixture task").waitFor();
    assert.match(await frame.locator("#items").innerText(), /not_checked/);
    await frame.locator("#next").click();
    await page.waitForFunction(() =>
      window.reads.some((read) => read.arguments.assignmentOffset === 10),
    );
    const reads = await page.evaluate(() => window.reads);
    assert(
      reads.every((read) =>
        [
          "moodle_get_dashboard",
          "moodle_get_tasks",
          "moodle_search_materials",
        ].includes(read.name),
      ),
    );
    const overflow = await frame
      .locator("body")
      .evaluate((body) => body.scrollWidth > window.innerWidth + 1);
    assert.equal(
      overflow,
      false,
      "The mobile view must not overflow horizontally",
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Study Hub browser fixture passed at mobile and desktop widths; paging, safe rendering and explicit context verified.",
  );
} finally {
  await browser.close();
}
