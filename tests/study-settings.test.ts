import { describe, it, expect, vi } from "vitest";
import { AuthStore } from "../src/auth/store.js";
import {
  studyPreferenceStore,
  preferenceDefaults,
  registerStudySettings,
} from "../src/workflows/settings.js";
import { registerStudyPlan } from "../src/workflows/study-plan.js";
import type { McpServer } from "@modelcontextprotocol/server";

describe("persistent study settings", () => {
  it("reads defaults without a write and persists owner-scoped partial updates", () => {
    const store = new AuthStore(":memory:", "a".repeat(64));
    try {
      const alice = studyPreferenceStore(store, "alice");
      expect(alice.read()).toEqual(preferenceDefaults);
      expect(
        store.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='mcp_study_preferences'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        alice.update({ set: { daysAhead: 14, minutesPerDay: 30 } }),
      ).toEqual({ ...preferenceDefaults, daysAhead: 14, minutesPerDay: 30 });
      expect(studyPreferenceStore(store, "bob").read()).toEqual(
        preferenceDefaults,
      );
      expect(studyPreferenceStore(store, "alice").read().daysAhead).toBe(14);
      alice.update({ set: { courseId: 123 } });
      expect(alice.read()).toEqual({
        daysAhead: 14,
        minutesPerDay: 30,
        courseId: 123,
      });
      expect(
        JSON.stringify(
          store.db.prepare("SELECT * FROM mcp_study_preferences").all(),
        ),
      ).not.toContain("alice");
    } finally {
      store.close();
    }
  });
  it("rejects invalid, empty and owner-supplied patches without creating storage", () => {
    const store = new AuthStore(":memory:", "a".repeat(64));
    try {
      const prefs = studyPreferenceStore(store, "alice");
      for (const args of [
        { set: {} },
        { set: { minutesPerDay: 300 } },
        { set: { courseId: -1 } },
        { set: { userId: 99 } },
        { set: { daysAhead: 7 }, owner: "bob" },
      ])
        expect(() => prefs.update(args)).toThrow();
      expect(
        store.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='mcp_study_preferences'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      store.close();
    }
  });
  it("declares only a local-preference write and retains OAuth read scope", () => {
    const registerTool = vi.fn(),
      registerCapabilities = vi.fn();
    registerStudySettings(
      {
        registerTool,
        server: {
          registerCapabilities,
          getCapabilities: () => ({
            extensions: { "io.modelcontextprotocol/skills": {} },
          }),
        },
      } as unknown as McpServer,
      { read: () => preferenceDefaults, update: () => preferenceDefaults },
    );
    expect(registerCapabilities).toHaveBeenCalledWith({
      extensions: {
        "io.modelcontextprotocol/skills": {},
        "openai/settings": {
          readTool: "moodle_settings_read",
          updateTool: "moodle_settings_update",
        },
      },
    });
    const config = registerTool.mock.calls.find(
      ([name]) => name === "moodle_settings_update",
    )![1];
    expect(config.annotations.readOnlyHint).toBe(false);
    expect(config._meta.securitySchemes).toEqual([
      { type: "oauth2", scopes: ["moodle:read"] },
    ]);
  });
  it("prefills missing MRTR choices but does not accept them or call Moodle", async () => {
    const registerTool = vi.fn();
    const source = vi.fn();
    const read = vi
      .fn()
      .mockReturnValue({ daysAhead: 14, minutesPerDay: 30, courseId: 123 });
    registerStudyPlan({ registerTool } as unknown as McpServer, source, read);
    const handler = registerTool.mock.calls[0][2];
    const result = await handler({}, { mcpReq: {} });
    expect(result.resultType).toBe("input_required");
    expect(JSON.stringify(result)).toContain('"default":14');
    expect(JSON.stringify(result)).toContain('"default":30');
    expect(source).not.toHaveBeenCalled();
    read.mockClear();
    await handler(
      {},
      { mcpReq: { inputResponses: { study_window: { action: "cancel" } } } },
    );
    expect(read).not.toHaveBeenCalled();
    expect(source).not.toHaveBeenCalled();
  });
});
