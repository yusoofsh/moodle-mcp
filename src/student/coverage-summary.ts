import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { apiCoverage } from "./coverage-report.js";

const percentage = z.number().min(0).max(100).nullable();
export const coverageSummarySchema = z.object({
  sourceRevision: z.string(),
  advertisedApiCount: z.number().int().nonnegative(),
  inventoryCoveragePercent: percentage,
  routedApiCount: z.number().int().nonnegative(),
  functionRoutePercent: percentage,
  declaredReadApiCount: z.number().int().nonnegative(),
  routedDeclaredReadApiCount: z.number().int().nonnegative(),
  routedDeclaredReadPercent: percentage,
  declaredWriteApiCount: z.number().int().nonnegative(),
  unknownDeclarationApiCount: z.number().int().nonnegative(),
  unexposedApiCount: z.number().int().nonnegative(),
  functionalWorkflowCoveragePercent: z.null(),
  liveVerifiedApiCount: z.null(),
  measurementNote: z.string(),
});

/** Available through the existing site-info tool even when a client caches old tool names. */
export function apiCoverageSummary(client: MoodleClient) {
  const report = apiCoverage(client, { limit: 1 }).data;
  const routedReads = report.declaredReadCount - report.unexposedReadCount;
  return coverageSummarySchema.parse({
    sourceRevision: report.sourceRevision,
    advertisedApiCount: report.advertisedApiCount,
    inventoryCoveragePercent: report.inventoryCoveragePercent,
    routedApiCount: report.functionRoutes,
    functionRoutePercent: report.functionRoutePercent,
    declaredReadApiCount: report.declaredReadCount,
    routedDeclaredReadApiCount: routedReads,
    routedDeclaredReadPercent: report.declaredReadCount
      ? Math.round((routedReads / report.declaredReadCount) * 10000) / 100
      : null,
    declaredWriteApiCount: report.declaredWriteCount,
    unknownDeclarationApiCount: report.unknownDeclarationCount,
    unexposedApiCount: report.unexposedCount,
    functionalWorkflowCoveragePercent: null,
    liveVerifiedApiCount: null,
    measurementNote:
      "Inventory and invocation routes only, not full parameter coverage, student permission or live validation. Live tests are recorded separately. No listed API is invoked by this measurement.",
  });
}
