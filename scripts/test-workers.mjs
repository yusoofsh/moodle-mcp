import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { strict as assert } from 'node:assert';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../dist/auth/password.js';
import { TOOL_FUNCTIONS } from '../dist/tool-policy.js';

const ORIGIN='http://localhost:3000';
const REDIRECT='https://client.example/callback';
const PASSWORD='workers test passphrase only';
const storage=await mkdtemp(join(tmpdir(),'moodle-workerd-'));
let calls=0, mf;
const bindings={PUBLIC_URL:ORIGIN,ALLOW_INSECURE_HTTP:'true',AUTH_SECRET:'ab'.repeat(32),AUTH_PASSWORD_HASH:await hashPassword(PASSWORD,true),MOODLE_URL:'https://moodle.example',MOODLE_TOKEN:'test-private-moodle-token'};

async function start(override={}) {
  const options=convertV4MiniflareOptions({
    name:'moodle-mcp',modules:true,stripCfConnectingIp:false,
    scriptPath:'.wrangler/build/worker.js',compatibilityDate:'2026-09-23',
    compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
    durableObjects:{MOODLE_MCP:{className:'MoodleMcp',useSQLite:true}},
    bindings:{...bindings,...override},
    outboundService:async request=>{
      assert.equal(new URL(request.url).origin,'https://moodle.example');
      calls++;
      const params=new URLSearchParams(await request.text());
      assert.equal(params.get('wstoken'),bindings.MOODLE_TOKEN);
      switch(params.get('wsfunction')) {
        case 'core_webservice_get_site_info': return Response.json({userid:42,sitename:'Test Moodle',fullname:'Test Student',release:'4.5',functions:[...new Set(Object.values(TOOL_FUNCTIONS).flat())].map(name=>({name,version:'1'}))});
        case 'core_enrol_get_users_courses': return Response.json([{id:7,fullname:'Sample course',shortname:'TEST'}]);
        default: throw new Error('Unexpected Moodle call');
      }
    },
  });
  // Miniflare 5 does not forward the v4 durableObjectsPersist field.
  options.isolatedResourcePersistencePath=join(storage,'isolated');
  options.resourcePersistencePath=join(storage,'shared');
  mf=new Miniflare(options);
  await mf.ready;
}
class Browser {
  cookies=new Map();
  constructor(ip='192.0.2.1'){this.ip=ip;}
  async request(path,options={}) {
    const url=new URL(path,ORIGIN);
    assert.equal(url.origin,ORIGIN,'Do not follow external redirects');
    const headers=new Headers(options.headers);
    headers.set('CF-Connecting-IP',this.ip);
    if(this.cookies.size) headers.set('Cookie',[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '));
    const res=await mf.dispatchFetch(url.href,{...options,headers,redirect:'manual'});
    for(const c of res.headers.getSetCookie()) {
      const part=c.split(';')[0],eq=part.indexOf('='),key=part.slice(0,eq),value=part.slice(eq+1);
      if(!value||/Max-Age=0(?:;|$)/i.test(c)) this.cookies.delete(key); else this.cookies.set(key,value);
    }
    const text=await res.text();
    let json;
    try{json=JSON.parse(text);}catch{ /* HTML and plaintext are intentional. */ }
    return {status:res.status,headers:res.headers,text,json};
  }
  post(path,data){return this.request(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(path.startsWith('/interaction')?{Origin:ORIGIN}:{})},body:new URLSearchParams(data)});}
  async follow(response){
    for(let i=0;i<8&&response.headers.has('location')&&new URL(response.headers.get('location'),ORIGIN).origin===ORIGIN;i++) response=await this.request(response.headers.get('location'));
    return response;
  }
}
const client=new Browser();
async function register(){
  const r=await client.request('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[REDIRECT],response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none',client_name:'Workerd test client'})});
  assert.equal(r.status,201,r.text); return r.json.client_id;
}
async function begin(clientId,ip='192.0.2.2'){
  const browser=new Browser(ip),verifier=randomBytes(32).toString('base64url');
  const q=new URLSearchParams({client_id:clientId,redirect_uri:REDIRECT,response_type:'code',scope:'openid offline_access moodle:read',resource:ORIGIN+'/mcp',state:'test-client-state',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  const form=await browser.follow(await browser.request('/oauth/authorize?'+q));
  assert.equal(form.status,200,form.text);
  const nonce=/name="csrf" value="([^"]+)"/.exec(form.text)?.[1];
  assert.ok(nonce,form.text);return {browser,verifier,nonce};
}
async function authorize(clientId,ip){
  const flow=await begin(clientId,ip);
  const consent=await flow.browser.follow(await flow.browser.post('/interaction/password',{csrf:flow.nonce,password:PASSWORD}));
  assert.equal(consent.status,200,consent.text);assert.match(consent.text,/Authorize Moodle MCP/);
  const csrf=/name="csrf" value="([^"]+)"/.exec(consent.text)?.[1];assert.ok(csrf);
  const res=await flow.browser.follow(await flow.browser.post('/interaction/confirm',{csrf,decision:'allow'}));
  assert.ok(res.headers.has('location'),res.text);
  const redirect=new URL(res.headers.get('location'));
  assert.equal(redirect.origin,new URL(REDIRECT).origin);
  assert.equal(redirect.searchParams.get('state'),'test-client-state');
  assert.ok(redirect.searchParams.get('code'),redirect.href);
  return {...flow,code:redirect.searchParams.get('code')};
}
function exchange(id,flow,overrides={}){return client.post('/oauth/token',{grant_type:'authorization_code',client_id:id,code:flow.code,code_verifier:flow.verifier,redirect_uri:REDIRECT,resource:ORIGIN+'/mcp',...overrides});}
function rpc(token,method,params){return client.request('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});}
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
try {
  await check('bundle fits Free plan and excludes node:sqlite',async()=>{
    const bundle=await readFile('.wrangler/build/worker.js');
    const bytes=gzipSync(bundle).length;
    assert.ok(bytes<3*1024*1024,`Gzipped bundle ${bytes} exceeds 3 MiB`);
    assert.ok(!bundle.toString().includes('node:sqlite'));
    console.log(`Worker bundle: ${bytes} bytes gzipped`);
  });
  await start();
  await check('health, discovery, and unauthenticated rejection',async()=>{
    assert.equal((await client.request('/healthz')).status,200);
    const discovery=await client.request('/.well-known/oauth-authorization-server');
    assert.equal(discovery.status,200,discovery.text);
    assert.ok(discovery.json.code_challenge_methods_supported.includes('S256'));
    const unauth=await client.request('/mcp',{method:'POST'});
    assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource/);assert.equal(calls,0);
  });
  const id=await register();let granted;
  await check('password, consent, PKCE exchange, code replay',async()=>{
    const flow=await authorize(id,'192.0.2.2');const token=await exchange(id,flow);
    assert.equal(token.status,200,token.text);assert.ok(token.json.refresh_token);
    assert.ok(!token.text.includes(PASSWORD));granted=token.json;
    const replay=await authorize(id,'192.0.2.3');assert.equal((await exchange(id,replay)).status,200);
    assert.equal((await exchange(id,replay)).status,400);
  });
  await check('MCP initialize, all 14 read-only tools, Moodle request',async()=>{
    const init=await rpc(granted.access_token,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'workerd-test',version:'1'}});assert.equal(init.status,200,init.text);
    const tools=await rpc(granted.access_token,'tools/list',{});assert.equal(tools.status,200,tools.text);
    assert.equal(tools.json.result.tools.length,14);assert.ok(tools.json.result.tools.every(t=>t.annotations.readOnlyHint));
    const result=await rpc(granted.access_token,'tools/call',{name:'moodle_list_courses',arguments:{}});
    assert.equal(result.status,200,result.text);assert.match(result.text,/Sample course/);assert.ok(!result.text.includes(bindings.MOODLE_TOKEN));
  });
  await check('OAuth persists across workerd process restart',async()=>{
    await mf.dispose();await start();
    const result=await rpc(granted.access_token,'tools/list',{});assert.equal(result.status,200,result.text);assert.equal(result.json.result.tools.length,14);
  });
  await check('refresh rotation and replay family revocation',async()=>{
    const refresh=value=>client.post('/oauth/token',{grant_type:'refresh_token',client_id:id,refresh_token:value,resource:ORIGIN+'/mcp'});
    const rotated=await refresh(granted.refresh_token);assert.equal(rotated.status,200,rotated.text);assert.notEqual(rotated.json.refresh_token,granted.refresh_token);
    assert.equal((await refresh(granted.refresh_token)).status,400);assert.equal((await rpc(rotated.json.access_token,'tools/list',{})).status,401);
  });
  await check('wrong password, one-use nonce, foreign Origin',async()=>{
    const flow=await begin(id,'192.0.2.4');
    const wrong=await flow.browser.post('/interaction/password',{csrf:flow.nonce,password:'not the password'});
    assert.equal(wrong.status,401,wrong.text);assert.ok(!wrong.text.includes('not the password'));
    assert.equal((await flow.browser.post('/interaction/password',{csrf:flow.nonce,password:PASSWORD})).status,403);
    const nonce=/name="csrf" value="([^"]+)"/.exec(wrong.text)?.[1];assert.ok(nonce);
    const cross=await flow.browser.request('/interaction/password',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://evil.example'},body:new URLSearchParams({csrf:nonce,password:PASSWORD})});
    assert.equal(cross.status,403);
  });
  await check('password throttle persists across restart',async()=>{
    const flow=await begin(id,'192.0.2.50');let nonce=flow.nonce;
    for(let i=0;i<3;i++){
      const r=await flow.browser.post('/interaction/password',{csrf:nonce,password:'wrong passphrase'});assert.equal(r.status,401,r.text);nonce=/name="csrf" value="([^"]+)"/.exec(r.text)?.[1];assert.ok(nonce);
    }
    await mf.dispose();await start();
    for(let i=0;i<2;i++){
      const r=await flow.browser.post('/interaction/password',{csrf:nonce,password:'wrong passphrase'});assert.equal(r.status,401,r.text);nonce=/name="csrf" value="([^"]+)"/.exec(r.text)?.[1];assert.ok(nonce);
    }
    const throttled=await flow.browser.post('/interaction/password',{csrf:nonce,password:PASSWORD});assert.equal(throttled.status,429,throttled.text);assert.ok(throttled.headers.has('retry-after'));
  });
  await check('body bounds, origin checks, unknown paths',async()=>{
    const large=await client.request('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(129*1024)});assert.equal(large.status,413,large.text);
    assert.equal((await client.request('/mcp',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await client.request('/unconfigured-route')).status,404);
  });
  await check('password rotation rejects persisted access and refresh tokens',async()=>{
    const flow=await authorize(id,'192.0.2.70');const r=await exchange(id,flow);assert.equal(r.status,200,r.text);
    await mf.dispose();await start({AUTH_PASSWORD_HASH:await hashPassword('a different workers passphrase',true)});
    assert.equal((await rpc(r.json.access_token,'tools/list',{})).status,401);
    const refresh=await client.post('/oauth/token',{grant_type:'refresh_token',client_id:id,refresh_token:r.json.refresh_token,resource:ORIGIN+'/mcp'});assert.equal(refresh.status,400,refresh.text);
  });
  await check('missing secrets fail closed',async()=>{
    await mf.dispose();await start({AUTH_PASSWORD_HASH:''});
    assert.equal((await client.request('/mcp',{method:'POST'})).status,503);
  });
  console.log(`Workers runtime checks: ${checks.length} passed`);
} finally {await mf?.dispose();await rm(storage,{recursive:true,force:true});}
