import { describe, expect, it, vi } from "vitest";
import type { MoodleClient } from "../src/moodle-client.js";
import {
  apiCoverageSummary,
  coverageSummarySchema,
} from "../src/student/coverage-summary.js";

describe("honest site-info coverage summary", () => {
  it("distinguishes indexed functions, invocation routes and live evidence", () => {
    const call = vi.fn();
    const client = {
      call,
      supportedFunctions: new Set([
        "core_webservice_get_site_info",
        "core_user_get_users_by_field",
        "core_message_send_instant_messages",
        "custom_unreviewed_function",
      ]),
    } as unknown as MoodleClient;
    const summary = apiCoverageSummary(client);
    expect(summary.advertisedApiCount).toBe(4);
    expect(summary.inventoryCoveragePercent).toBe(100);
    expect(summary.routedApiCount).toBe(2);
    expect(summary.functionRoutePercent).toBe(50);
    expect(summary.functionalWorkflowCoveragePercent).toBeNull();
    expect(summary.liveVerifiedApiCount).toBeNull();
    expect(summary.unknownDeclarationApiCount).toBeGreaterThanOrEqual(1);
    expect(coverageSummarySchema.safeParse(summary).success).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it("does not report 100 percent when the advertised inventory is empty", () => {
    const summary = apiCoverageSummary({
      supportedFunctions: new Set(),
    } as unknown as MoodleClient);
    expect(summary.advertisedApiCount).toBe(0);
    expect(summary.inventoryCoveragePercent).toBeNull();
    expect(summary.functionRoutePercent).toBeNull();
    expect(summary.routedDeclaredReadPercent).toBeNull();
  });
});
