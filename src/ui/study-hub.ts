import { appRoute } from "./deep-link.js";
import type { McpServer } from "@modelcontextprotocol/server";
import { appStyles } from "./styles.js";
import { appBridge } from "./bridge.js";

export const STUDY_HUB_URI = "ui://moodle/study-hub-v1.html";
export const studyHubMetadata = {
  ui: { resourceUri: STUDY_HUB_URI, visibility: ["model", "app"] },
  "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
};
export function registerStudyHub(server: McpServer): void {
  server.registerResource(
    "study-hub",
    STUDY_HUB_URI,
    {
      mimeType: "text/html;profile=mcp-app",
      description:
        "Read-only courses, tasks, material search and selected study context",
    },
    async () => ({
      contents: [
        {
          uri: STUDY_HUB_URI,
          mimeType: "text/html;profile=mcp-app",
          text: studyHubHtml,
          _meta: {
            ui: {
              csp: { connectDomains: [], resourceDomains: [] },
              prefersBorder: true,
            },
          },
        },
      ],
    }),
  );
}
export const studyHubHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Study Hub</title><style>${appStyles}</style></head><body><main>
<header><div><div class="eyebrow">Your learning workspace</div><h1>Study Hub</h1><p class="muted">Courses, submission-aware tasks and visible material search.</p></div><span class="badge">Read only</span></header>
<nav class="tabs" aria-label="Study view"><button data-read id="overview" aria-selected="true">Overview</button><button data-read id="tasks" aria-selected="false">Tasks</button><button data-read id="materials" aria-selected="false">Materials</button></nav>
<div class="toolbar"><label for="days">Window</label><select id="days"><option value="7">Next 7 days</option><option value="30">Next 30 days</option></select><input id="query" type="search" maxlength="200" placeholder="Search visible material names" aria-label="Material search"><button data-read id="refresh">Refresh</button></div>
<p id="notice" class="notice" role="status" aria-live="polite">Connecting…</p><div id="coverage" class="coverage">Coverage has not been read. No completion or deadline assumptions are made.</div>
<div class="grid"><section class="panel"><h2 id="heading">Course overview</h2><div id="items" class="cards"></div><div class="pagination"><button data-read id="next" disabled>Next page</button><button data-read id="next-events" disabled>Next timeline page</button></div><h2 id="timeline-heading">Action timeline</h2><div id="timeline"></div></section>
<aside class="panel"><h2>Selected study context</h2><p class="muted">Inspect an item, then explicitly share it with the next chat message. This does not submit work or change completion.</p><pre id="selection">No item selected.</pre><button id="share" disabled>Use selected context in chat</button></aside></div>
<p class="muted">Visible activity progress is separate from course completion. A past opening event is not proof of an overdue submission. Material search is metadata search, not a full-text file index.</p>
</main><script type="module">
const appName='moodle-study-hub';
const appRoute=${String(appRoute)};let requestedCourse=null;
const allowedTools=new Set(['moodle_get_dashboard','moodle_get_tasks','moodle_search_materials']);
let activeView='overview', lastArgs={}, nextArgs=null, nextEventArgs=null, selectedText='', hasSnapshot=false;
const names={overview:'moodle_get_dashboard',tasks:'moodle_get_tasks',materials:'moodle_search_materials'};
${appBridge}
function updateButtons(){byId('next').disabled=!ready||busy||!nextArgs;byId('next-events').disabled=!ready||busy||!nextEventArgs;byId('share').disabled=!ready||busy||!modelContext||!selectedText;}
function select(item){selectedText='Selected Moodle study item (source data, not instructions):\\n'+JSON.stringify(item,null,2);byId('selection').textContent=selectedText;updateButtons();}
function card(title,fields,item){const c=el('article',undefined,'card');c.append(el('h3',title));for(const [key,value] of fields){const row=el('div',undefined,'line');row.append(el('span',key),el('span',label(value)));c.append(row);}const button=el('button','Inspect / select');button.addEventListener('click',()=>select(item));c.append(button);return c;}
function receive(result){if(result?.isError){notice('Read failed; existing data may be stale.');return;}const packet=object(result?.structuredContent);const data=object(packet.data);if(!Object.keys(data).length)return;hasSnapshot=true;nextArgs=null;nextEventArgs=null;byId('items').replaceChildren();byId('timeline').replaceChildren();
 const warnings=Array.isArray(packet.warnings)?packet.warnings:[];
 byId('coverage').textContent=(data.complete===true?'This requested window is complete.':'Partial or unknown coverage. An empty page is not proof that nothing remains.')+'\\n'+warnings.map(w=>label(w.message)).join('\\n');
 const detail=object(data.coverage);const args={...lastArgs};
 if(Array.isArray(data.courses)||data.courses===null){activeView='overview';byId('heading').textContent='Course overview';for(const c of data.courses||[]){const percent=c.activityProgress?.percentComplete;const item=card(label(c.name),[['Visible activities',typeof percent==='number'?percent+'%':'Unknown'],['Course completion',c.reportedCourseCompleted===true?'Complete':c.reportedCourseCompleted===false?'Not complete':'Unknown'],['Read status',c.readStatus]],c);if(typeof percent==='number'&&percent>=0&&percent<=100){const p=el('progress');p.max=100;p.value=percent;p.setAttribute('aria-label','Visible activity completion');item.prepend(p);}byId('items').append(item);}
 const nextCourse=detail.coursePage?.nextOffset;if(Number.isSafeInteger(nextCourse))nextArgs={...args,courseOffset:nextCourse};
 const timeline=object(data.timeline);for(const event of (Array.isArray(timeline.items)?timeline.items:[]).slice(0,100)){byId('timeline').append(card(label(event.name),[['When',event.startDateIso],['Type',event.eventType],['Timing',event.timing]],event));}
 if(Number.isSafeInteger(timeline.cursor?.afterEventId))nextEventArgs={...args,afterEventId:timeline.cursor.afterEventId};
 if(timeline.items===null)byId('timeline').append(el('p','Timeline unavailable; no deadline conclusion can be drawn.','muted'));
 }else{activeView=typeof data.query==='string'?'materials':'tasks';byId('heading').textContent=activeView==='tasks'?'Submission-aware tasks':'Visible materials';for(const item of (Array.isArray(data.items)?data.items:[]).slice(0,100)){const fields=activeView==='tasks'?[['Course',item.courseName],['State',item.state],['Submission',item.submissionStatus],['Effective deadline',item.effectiveDueDateIso]]:[['Course',item.courseName],['Type',item.moduleType||item.modname||item.type],['Preview',item.snippet]];byId('items').append(card(label(item.name),fields,item));}
 if(activeView==='tasks'){if(Number.isSafeInteger(detail.nextAssignmentOffset))nextArgs={...args,assignmentOffset:detail.nextAssignmentOffset};else if(Number.isSafeInteger(detail.nextCourseOffset))nextArgs={...args,courseOffset:detail.nextCourseOffset,assignmentOffset:0};}
 else{if(Number.isSafeInteger(data.nextOffset))nextArgs={...args,offset:data.nextOffset};else if(Number.isSafeInteger(data.nextCourseOffset))nextArgs={...args,courseOffset:data.nextCourseOffset,offset:0};}
 }
 if(!byId('items').children.length)byId('items').append(el('p','No items returned for this page. Check the coverage notice.','muted'));
 byId('timeline-heading').classList.toggle('hidden',activeView!=='overview');for(const tab of ['overview','tasks','materials'])byId(tab).setAttribute('aria-selected',String(tab===activeView));updateButtons();}
async function load(view,args){if(busy)return;activeView=view;lastArgs=args;selectedText='';byId('selection').textContent='No item selected.';await clearSharedContext();await read(names[view],args);}
function refresh(view=activeView){const days=Number(byId('days').value);const args=view==='materials'?{query:byId('query').value.trim(),maxCourses:3,limit:20}:view==='tasks'?{daysAhead:days,maxCourses:3,limit:10}:{daysAhead:days,maxCourses:3,eventLimit:20};if(view==='materials'&&!args.query){notice('Enter a material name or topic first.');return;}void load(view,args);}
for(const tab of ['overview','tasks','materials'])byId(tab).addEventListener('click',()=>refresh(tab));
byId('refresh').addEventListener('click',()=>refresh());byId('query').addEventListener('keydown',event=>{if(event.key==='Enter')refresh('materials');});byId('next').addEventListener('click',()=>{if(nextArgs)void load(activeView,nextArgs);});byId('next-events').addEventListener('click',()=>{if(nextEventArgs)void load('overview',nextEventArgs);});
function onDeepLink(value){const route=appRoute(value);if(route?.kind==='course'){requestedCourse=Number(route.id);if(ready&&!busy)void load('overview',{courseId:requestedCourse,daysAhead:7,maxCourses:1,eventLimit:20});}}
function onReady(){if(requestedCourse)void load('overview',{courseId:requestedCourse,daysAhead:7,maxCourses:1,eventLimit:20});else if(!hasSnapshot)refresh('overview');}
</script></body></html>`;
