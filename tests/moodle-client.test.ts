import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MoodleClient } from "../src/moodle-client.js";

const mockFetch = vi.fn();
const base = { baseUrl: "https://moodle.uni.edu", maxFileBytes: 1024 * 1024 };
const info = { userid: 42, username: "student", sitename: "My Uni", fullname: "Alice Smith", release: "4.3.0", functions: [{name:"core_webservice_get_site_info",version:"1"}] };
function mockOkJson(data: unknown) { return Response.json(data); }
beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });
afterEach(() => vi.unstubAllGlobals());
async function client(token="tok123") {
  mockFetch.mockResolvedValueOnce(mockOkJson(info));
  return MoodleClient.create({...base, token});
}

describe("MoodleClient.create with token", () => {
  it("fetches site info and exposes userId", async () => {
    const c=await client();
    expect(c.userId).toBe(42);
    expect(c.siteName).toBe("My Uni");
    expect(c.release).toBe("4.3.0");
    expect(c.supportedFunctions.has("core_webservice_get_site_info")).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
describe("MoodleClient.create with username+password", () => {
  it("POSTs to login/token.php then fetches site info", async () => {
    mockFetch.mockResolvedValueOnce(mockOkJson({token:"fetched-token"})).mockResolvedValueOnce(mockOkJson({...info,userid:7}));
    const c=await MoodleClient.create({...base,username:"bob",password:"pass"});
    expect(c.userId).toBe(7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("/login/token.php");
  });
  it("throws descriptive error on login failure", async () => {
    mockFetch.mockResolvedValueOnce(mockOkJson({error:"Invalid login"}));
    await expect(MoodleClient.create({...base,username:"x",password:"y"})).rejects.toThrow("Invalid login");
  });
});
describe("MoodleClient.call", () => {
  it("throws on webservicesnotenabled", async () => {
    const c=await client();
    mockFetch.mockResolvedValueOnce(mockOkJson({exception:"moodle_exception",errorcode:"webservicesnotenabled",message:"Web services are disabled"}));
    await expect(c.call("any_function")).rejects.toThrow("Web services are not enabled");
  });
  it("throws on invalidtoken", async () => {
    const c=await client();
    mockFetch.mockResolvedValueOnce(mockOkJson({exception:"moodle_exception",errorcode:"invalidtoken",message:"Invalid token"}));
    await expect(c.call("any_function")).rejects.toThrow("Invalid Moodle token");
  });
  it("returns typed response on success", async () => {
    const c=await client();
    mockFetch.mockResolvedValueOnce(mockOkJson([{id:1,fullname:"Math 101"}]));
    const result=await c.call<{id:number;fullname:string}[]>("core_enrol_get_users_courses",{userid:42});
    expect(result[0].fullname).toBe("Math 101");
  });
});
describe("MoodleClient.downloadFile", () => {
  it("refuses another host", async () => {
    const c=await client();
    await expect(c.downloadFile("https://evil.example/pluginfile.php/x.pdf")).rejects.toThrow(/not on this Moodle host/);
  });
  it("refuses non-pluginfile paths", async () => {
    const c=await client();
    await expect(c.downloadFile("https://moodle.uni.edu/other/path.pdf")).rejects.toThrow(/pluginfile\.php/);
  });
  it("downloads bytes with token only on the outbound request", async () => {
    const c=await client("mytoken");
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array([1,2,3,4]),{headers:{"content-type":"application/pdf"}}));
    const result=await c.downloadFile("https://moodle.uni.edu/pluginfile.php/5/course/section/0/notes.pdf");
    expect(result.mime).toBe("application/pdf");
    expect(Array.from(result.bytes)).toEqual([1,2,3,4]);
    expect(String(mockFetch.mock.calls.at(-1)?.[0])).toContain("token=mytoken");
    expect(mockFetch.mock.calls.at(-1)?.[1].redirect).toBe("manual");
  });
});
