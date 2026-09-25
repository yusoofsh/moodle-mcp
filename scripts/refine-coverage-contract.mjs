import fs from "node:fs/promises";
const path = "src/student/safe-api.ts";
let s = await fs.readFile(path, "utf8");
if (!s.includes("export interface ReadOperationResult")) {
  const signature = "  parameters: Args = {},\n) {";
  if (!s.includes(signature))
    throw new Error("Unexpected read adapter signature");
  s = s.replace(
    "  type ReadWarning,",
    "  type ReadWarning,\n  type ReadPacket,",
  );
  s = s.replace(
    "export async function invokeReadOperation(",
    `export interface ReadOperationResult {
  functionName: string;
  scope: 'self' | 'course' | 'module';
  result: unknown;
  complete: boolean;
  responseComplete: boolean;
  rawMetadata: boolean;
  truncated: boolean;
  redactedFields: number;
  untrusted: boolean;
  upstreamPagination: {offset:number|null;limit:number|null;page:number|null;mayHaveMore:boolean|null};
  permissionVerified: boolean;
}
export async function invokeReadOperation(`,
  );
  s = s.replace(
    signature,
    "  parameters: Args = {},\n): Promise<ReadPacket<ReadOperationResult>> {",
  );
  const invalid =
    "          result: null,\n          complete: false,\n          rawMetadata: true,";
  if (!s.includes(invalid))
    throw new Error("Unexpected invalid metadata branch");
  s = s.replace(
    invalid,
    "          result: null,\n          complete: false,\n          responseComplete: false,\n          truncated: false,\n          upstreamPagination: {offset:null,limit:null,page:null,mayHaveMore:null},\n          permissionVerified: true,\n          rawMetadata: true,",
  );
  s = s.replace(
    '  const complete =\n    response.state === "available"',
    '  const responseComplete =\n    response.state === "available"',
  );
  s = s.replace(
    "      complete,\n      rawMetadata: true,",
    '      complete: responseComplete && !Object.keys(spec.input instanceof z.ZodObject ? spec.input.shape : {}).some(key => ["offset", "limit", "page"].includes(key)),\n      responseComplete,\n      rawMetadata: true,',
  );
  s = s.replace(
    "        offset: args.offset ?? null,\n        limit: args.limit ?? null,\n        page: args.page ?? null,",
    '        offset: typeof args.offset === "number" ? args.offset : null,\n        limit: typeof args.limit === "number" ? args.limit : null,\n        page: typeof args.page === "number" ? args.page : null,\n        mayHaveMore: null,',
  );
  await fs.writeFile(path, s);
}
