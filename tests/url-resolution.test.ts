import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import type { MoodleClient } from "../src/moodle-client.js";
import {
  resolveUrl,
  resolveCourseUrls,
  safeExternalUrl,
  type UrlSection,
} from "../src/url-resolver.js";
import { registerAllTools } from "../src/register-tools.js";

const site = "https://moodle.example/learn",
  course = 7,
  moduleId = 201;
const destination = "https://www.youtube.com/watch?v=example1234&t=42";
let sections: UrlSection[],
  rows: unknown[],
  call: ReturnType<typeof vi.fn>,
  source: MoodleClient;
const pairs: { server: McpServer; client: Client }[] = [];
beforeEach(() => {
  sections = [
    {
      id: 1,
      name: "Recordings",
      modules: [
        {
          id: moduleId,
          name: "Tutor 1",
          modname: "url",
          instance: 61,
          uservisible: true,
        },
      ],
    },
  ];
  rows = [{ id: 61, coursemodule: moduleId, course, externalurl: destination }];
  call = vi.fn(async (fn: string) => {
    if (fn === "core_course_get_course_module")
      return { cm: { id: moduleId, course, modname: "url" } };
    if (fn === "core_course_get_contents") return sections;
    if (fn === "mod_url_get_urls_by_courses")
      return { urls: rows, warnings: [] };
    throw new Error("Unexpected API");
  });
  source = {
    siteUrl: site,
    userId: 42,
    supports: () => true,
    call,
    fileIdStore: { seal: vi.fn(async () => "f_synthetic") },
  } as unknown as MoodleClient;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Must not fetch any external destination");
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const p of pairs.splice(0)) {
    await p.client.close();
    await p.server.close();
  }
});
async function mcp() {
  const server = new McpServer({ name: "test", version: "1" });
  registerAllTools(server, async () => source);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  pairs.push({ server, client });
  await server.connect(st);
  await client.connect(ct);
  return client;
}
describe("authenticated Moodle URL resolution", () => {
  it("maps a course-module ID (not URL instance ID) and preserves target query parameters", async () => {
    const r = await resolveUrl(source, moduleId);
    expect(r).toMatchObject({
      moduleId,
      courseId: course,
      externalurl: destination,
      resolved: true,
      source: "mod_url_get_urls_by_courses",
      activityUrl: site + "/mod/url/view.php?id=201",
    });
    expect(call.mock.calls.map((c) => c[0])).toEqual([
      "core_course_get_course_module",
      "core_course_get_contents",
      "mod_url_get_urls_by_courses",
    ]);
    expect(call).toHaveBeenLastCalledWith("mod_url_get_urls_by_courses", {
      "courseids[0]": course,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("checks the supplied course instead of treating it as authorization", async () => {
    await resolveUrl(source, moduleId, course);
    expect(call.mock.calls[0]).toEqual([
      "core_course_get_contents",
      { courseid: course },
    ]);
    await expect(resolveUrl(source, 999, course)).rejects.toThrow(
      /not visible/,
    );
  });
  it("uses returned content URLs when the optional URL API is unavailable", async () => {
    source.supports = (fn) => fn !== "mod_url_get_urls_by_courses";
    sections[0].modules[0].contents = [{ type: "url", fileurl: destination }];
    expect(await resolveUrl(source, moduleId, course)).toMatchObject({
      externalurl: destination,
      source: "core_course_get_contents",
    });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("never relabels a wrapper as the external URL when resolution is unavailable", async () => {
    source.supports = (fn) => fn !== "mod_url_get_urls_by_courses";
    sections[0].modules[0].url = site + "/mod/url/view.php?id=201";
    expect(await resolveUrl(source, moduleId, course)).toMatchObject({
      resolved: false,
      externalurl: null,
      reason: "api_unavailable",
    });
  });
  it("requires an available module-lookup API when no course is given", async () => {
    source.supports = (fn) => fn !== "core_course_get_course_module";
    await expect(resolveUrl(source, moduleId)).rejects.toThrow(/courseId/);
    expect(call).not.toHaveBeenCalled();
  });
  it.each([false, 0])(
    "refuses modules hidden from the current user: %s",
    async (value) => {
      sections[0].modules[0].uservisible = value;
      await expect(resolveUrl(source, moduleId, course)).rejects.toThrow(
        /not visible/,
      );
      expect(call).toHaveBeenCalledTimes(1);
    },
  );
  it("refuses hidden sections and non-URL activities", async () => {
    sections[0].uservisible = false;
    await expect(resolveUrl(source, moduleId, course)).rejects.toThrow(
      /not visible/,
    );
    sections[0].uservisible = true;
    sections[0].modules[0].modname = "quiz";
    await expect(resolveUrl(source, moduleId, course)).rejects.toThrow(
      /URL activity/,
    );
  });
  it("does not expose rows for another course, module or URL instance", async () => {
    rows = [
      { id: 61, coursemodule: moduleId, course: 999, externalurl: destination },
      { id: 61, coursemodule: 999, course, externalurl: destination },
      { id: 777, coursemodule: moduleId, course, externalurl: destination },
    ];
    expect(await resolveUrl(source, moduleId, course)).toMatchObject({
      resolved: false,
      externalurl: null,
    });
  });
  it("does not use hidden or ambiguous URL API entries", async () => {
    rows = [
      {
        id: 61,
        coursemodule: moduleId,
        course,
        externalurl: destination,
        uservisible: false,
      },
    ];
    expect((await resolveUrl(source, moduleId, course)).resolved).toBe(false);
    rows = [
      { id: 61, coursemodule: moduleId, course, externalurl: destination },
      {
        id: 61,
        coursemodule: moduleId,
        course,
        externalurl: "https://example.org/other",
      },
    ];
    expect((await resolveUrl(source, moduleId, course)).reason).toBe(
      "ambiguous_target",
    );
  });
  it("degrades URL enrichment without losing file listings or disclosing API errors", async () => {
    call.mockImplementation(async (fn: string) => {
      if (fn === "core_course_get_contents") return sections;
      throw new Error("credential=DO-NOT-LEAK");
    });
    const result = await resolveCourseUrls(source, course, sections);
    expect(result.get(moduleId)).toMatchObject({
      resolved: false,
      reason: "api_unavailable",
    });
    expect(JSON.stringify([...result])).not.toContain("DO-NOT-LEAK");
  });
  it("batch resolves one course with one URL API call, excluding inaccessible modules", async () => {
    sections[0].modules.push(
      { id: 202, name: "Hidden", modname: "url", uservisible: false },
      { id: 203, name: "Tutor 2", modname: "url", uservisible: true },
    );
    const result = await resolveCourseUrls(source, course, sections);
    expect([...result.keys()]).toEqual([201, 203]);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("does not call the optional API when there are no visible URL modules", async () => {
    sections[0].modules = [];
    expect((await resolveCourseUrls(source, course, sections)).size).toBe(0);
    expect(call).not.toHaveBeenCalled();
  });
  it("retains real capability checks before resolution is invoked", async () => {
    source.supports = () => false;
    const client = await mcp();
    expect(
      (await client.listTools()).tools.some(
        (t) => t.name === "moodle_resolve_url",
      ),
    ).toBe(true);
    const r = await client.callTool({
      name: "moodle_resolve_url",
      arguments: { moduleId, courseId: course },
    });
    expect(r.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
  it("returns both structured data and JSON text through the actual SDK", async () => {
    const client = await mcp();
    const result = await client.callTool({
      name: "moodle_resolve_url",
      arguments: { moduleId },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      externalurl: destination,
      moduleId,
    });
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(
      result.structuredContent,
    );
  });
  it.each([0, -1, 1.5, "201", 1e20])(
    "rejects invalid module identifiers before upstream access: %s",
    async (id) => {
      const client = await mcp();
      const r = await client.callTool({
        name: "moodle_resolve_url",
        arguments: { moduleId: id },
      });
      expect(r.isError).toBe(true);
      expect(call).not.toHaveBeenCalled();
    },
  );
  it("enriches resource text and structured links, retaining file IDs", async () => {
    sections[0].modules.push({
      id: 300,
      name: "Notes",
      modname: "resource",
      contents: [
        {
          type: "file",
          filename: "notes.txt",
          fileurl: site + "/pluginfile.php/notes.txt",
          filesize: 25,
          mimetype: "text/plain",
        },
      ],
    });
    const client = await mcp();
    const r = await client.callTool({
      name: "moodle_list_resources",
      arguments: { courseId: course },
    });
    expect(r.isError).not.toBe(true);
    expect(JSON.stringify(r.content)).toContain(destination);
    expect(JSON.stringify(r.content)).toContain("moduleId: `201`");
    expect(JSON.stringify(r.content)).toContain("f_synthetic");
    expect(r.structuredContent?.text).toBe(
      (r.content as { text: string }[])[0].text,
    );
    expect(String(r.structuredContent?.text)).toContain("f_synthetic");
    expect(r.structuredContent).toMatchObject({
      courseId: course,
      links: [{ moduleId, externalurl: destination }],
    });
  });
});
describe("URL output validation (no target fetching)", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "ftp://example.org/a",
    "//example.org/a",
    "https://user:pass@example.org/a",
    "https://example.org/\nfoo",
    "https:\\evil.example",
    "not a URL",
  ])("rejects %s", (url) => expect(safeExternalUrl(url)).toBeNull());
  it.each([
    destination,
    "https://youtu.be/example1234?si=abc&t=10",
    "http://example.org/course",
    "https://example.org/a(b)#part",
  ])("preserves HTTP(S) target semantics: %s", (url) =>
    expect(safeExternalUrl(url)).toBe(url),
  );
});
