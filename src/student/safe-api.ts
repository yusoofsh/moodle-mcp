import { z } from 'zod';
import type { MoodleClient } from '../moodle-client.js';
import { loadSections } from './course-data.js';
import { readableContent, safeContentUrl } from './content-text.js';
import { idSchema, readApi, packet, warning, type ReadWarning } from './result.js';

type Args = Record<string, unknown>;
type Params = Record<string, string | number | boolean>;
export interface ReadOperation {
  input: z.ZodType<Args>;
  scope: 'self' | 'course' | 'module';
  purpose: string;
  params: (client: MoodleClient, input: Args) => Params;
  moduleType?: string;
  resultKey?: string;
}
const none = z.object({}).strict();
const course = z.object({ courseId: idSchema }).strict();
const pageFields = { offset: z.number().int().min(0).max(100000).optional(), limit: z.number().int().min(1).max(100).optional() };
const page = z.object(pageFields).strict();
const coursePage = z.object({ courseId: idSchema, ...pageFields }).strict();
const moduleInput = z.object({ courseId: idSchema, moduleId: idSchema }).strict();
const value = (a: Args, key: string, fallback: number) => typeof a[key] === 'number' ? a[key] as number : fallback;
const selfPage = (c: MoodleClient, a: Args): Params => ({ userid: c.userId, limitfrom: value(a, 'offset', 0), limitnum: value(a, 'limit', 20) });
const courseParams = (_c: MoodleClient, a: Args): Params => ({ courseid: a.courseId as number });
const selfParams = (c: MoodleClient): Params => ({ userid: c.userId });

/** Explicit allowlist. A name containing get/read is NEVER sufficient authorization. */
export const READ_OPERATIONS: Record<string, ReadOperation> = {
  core_user_get_users_by_field: { input: none, scope: 'self', purpose: 'Current account profile only', params: c => ({ field: 'id', 'values[0]': c.userId }) },
  core_user_get_user_preferences: { input: z.object({ name: z.string().max(128).optional() }).strict(), scope: 'self', purpose: 'Current account preferences with secret fields withheld', params: (c,a) => ({ userid: c.userId, name: typeof a.name === 'string' ? a.name : '' }) },
  core_user_get_private_files_info: { input: none, scope: 'self', purpose: 'Current account private-file storage metadata, not file bytes', params: selfParams },
  core_group_get_course_user_groups: { input: course, scope: 'course', purpose: 'Current account groups in a visible course', params: (c,a) => ({ courseid: a.courseId as number, userid: c.userId, groupingid: 0 }) },
  core_group_get_course_groups: { input: course, scope: 'course', purpose: 'Course groups only where Moodle permits', params: courseParams },
  core_group_get_course_groupings: { input: course, scope: 'course', purpose: 'Course grouping metadata only where Moodle permits', params: courseParams },
  core_group_get_activity_allowed_groups: { input: moduleInput, scope: 'module', purpose: 'Allowed groups for one currently visible activity', params: (_c,a) => ({ cmid: a.moduleId as number }) },
  core_group_get_activity_groupmode: { input: moduleInput, scope: 'module', purpose: 'Group mode for one currently visible activity', params: (_c,a) => ({ cmid: a.moduleId as number }) },
  core_enrol_get_enrolled_users: { input: coursePage, scope: 'course', purpose: 'Visible course participants, limited to ID/full name', params: (_c,a) => ({ courseid: a.courseId as number, 'options[0][name]': 'limitfrom', 'options[0][value]': value(a,'offset',0), 'options[1][name]': 'limitnumber', 'options[1][value]': value(a,'limit',20), 'options[2][name]': 'userfields', 'options[2][value]': 'id,fullname' }) },
  core_enrol_get_course_enrolment_methods: { input: course, scope: 'course', purpose: 'Available enrolment method metadata; never enrols', params: courseParams },
  core_badges_get_user_badges: { input: z.object({ courseId: idSchema.optional(), page: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(), scope: 'self', purpose: 'Badges awarded to the current student', params: (c,a) => ({ userid:c.userId, courseid:value(a,'courseId',0), page:value(a,'page',0), perpage:value(a,'limit',20), onlypublic:false }) },
  core_message_get_conversations: { input: page, scope: 'self', purpose: 'Current account conversations without changing read status', params: selfPage },
  core_message_get_conversation_messages: { input: z.object({ conversationId:idSchema, ...pageFields, newest:z.boolean().optional() }).strict(), scope:'self', purpose:'Messages only in a conversation where the current account is a member; no read receipt', params:(c,a)=>({currentuserid:c.userId,convid:a.conversationId as number,limitfrom:value(a,'offset',0),limitnum:value(a,'limit',20),newest:a.newest===true,timefrom:0}) },
  core_message_get_user_contacts: {input:page,scope:'self',purpose:'Current account contacts',params:selfPage},
  core_message_get_blocked_users: {input:none,scope:'self',purpose:'Current account blocked-user list; does not block or unblock',params:selfParams},
  core_message_get_conversation_counts: {input:none,scope:'self',purpose:'Current account conversation counts',params:selfParams},
  core_message_get_unread_conversation_counts: {input:none,scope:'self',purpose:'Current account unread counts without marking read',params:selfParams},
  core_message_get_received_contact_requests_count: {input:none,scope:'self',purpose:'Current account pending contact request count',params:selfParams},
  core_message_get_contact_requests: {input:page,scope:'self',purpose:'Current account contact requests without accepting or declining',params:selfPage},
  core_message_get_user_message_preferences: {input:none,scope:'self',purpose:'Current account message-delivery preference metadata',params:selfParams},
  core_message_get_user_notification_preferences: {input:none,scope:'self',purpose:'Current account notification preference metadata',params:selfParams},
  gradereport_overview_get_course_grades: {input:none,scope:'self',purpose:'Current account cross-course grade overview',params:selfParams},
  gradereport_user_get_grade_items: {input:course,scope:'course',purpose:'Current account released grade items in one visible course',params:(c,a)=>({courseid:a.courseId as number,userid:c.userId})},
  gradereport_user_get_grades_table: {input:course,scope:'course',purpose:'Current account released grade table in one visible course',params:(c,a)=>({courseid:a.courseId as number,userid:c.userId})},
  core_course_get_updates_since: {input:z.object({courseId:idSchema,since:z.number().int().min(0)}).strict(),scope:'course',purpose:'Read updates since a timestamp; does not mark the course viewed',params:(_c,a)=>({courseid:a.courseId as number,since:a.since as number})},
  core_course_get_recent_courses: {input:page,scope:'self',purpose:'Recently accessed course list without recording a new course view',params:(c,a)=>({userid:c.userId,limit:value(a,'limit',20),offset:value(a,'offset',0)})},
  core_course_get_courses_by_field: {input:course,scope:'course',purpose:'Metadata for the selected visible course, never arbitrary site-wide enumeration',params:(_c,a)=>({field:'id',value:a.courseId as number})},
  core_calendar_get_calendar_events: {input:z.object({courseId:idSchema.optional(),from:z.number().int().min(0),to:z.number().int().positive()}).strict(),scope:'self',purpose:'Full read-only calendar window, including current-user events; no export tokens',params:(_c,a)=>({...a.courseId?{'events[courseids][0]':a.courseId as number}:{},'options[timestart]':a.from as number,'options[timeend]':a.to as number,'options[userevents]':true,'options[siteevents]':true})},
  core_calendar_get_calendar_monthly_view: {input:z.object({courseId:idSchema.optional(),year:z.number().int().min(1970).max(2100),month:z.number().int().min(1).max(12)}).strict(),scope:'self',purpose:'Read monthly calendar view without writing events',params:(_c,a)=>({year:a.year as number,month:a.month as number,courseid:value(a,'courseId',0)})},
  core_calendar_get_calendar_day_view: {input:z.object({courseId:idSchema.optional(),year:z.number().int().min(1970).max(2100),month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31)}).strict(),scope:'self',purpose:'Read day calendar view',params:(_c,a)=>({year:a.year as number,month:a.month as number,day:a.day as number,courseid:value(a,'courseId',0)})},
  core_calendar_get_calendar_upcoming_view: {input:z.object({courseId:idSchema.optional()}).strict(),scope:'self',purpose:'Read the user upcoming calendar view',params:(_c,a)=>({courseid:value(a,'courseId',0)})},
  core_calendar_get_calendar_access_information: {input:course,scope:'course',purpose:'Course calendar capability metadata, not permission to perform writes',params:courseParams},
  core_competency_list_course_competencies: {input:course,scope:'course',purpose:'Competencies associated with a visible course',params:courseParams},
  tool_lp_data_for_course_competencies_page: {input:course,scope:'course',purpose:'Visible course competency summary data without recording viewed events',params:courseParams},
  tool_lp_data_for_plans_page: {input:none,scope:'self',purpose:'Current student learning plans',params:selfParams},
};

const activityFamilies: [string,string,string][] = [
 ['bigbluebuttonbn','bigbluebuttonbns','mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses'],
 ['book','books','mod_book_get_books_by_courses'],['chat','chats','mod_chat_get_chats_by_courses'],
 ['choice','choices','mod_choice_get_choices_by_courses'],['data','databases','mod_data_get_databases_by_courses'],
 ['feedback','feedbacks','mod_feedback_get_feedbacks_by_courses'],['folder','folders','mod_folder_get_folders_by_courses'],
 ['forum','forums','mod_forum_get_forums_by_courses'],['glossary','glossaries','mod_glossary_get_glossaries_by_courses'],
 ['h5pactivity','h5pactivities','mod_h5pactivity_get_h5pactivities_by_courses'],['imscp','imscps','mod_imscp_get_imscps_by_courses'],
 ['label','labels','mod_label_get_labels_by_courses'],['lesson','lessons','mod_lesson_get_lessons_by_courses'],
 ['lti','ltis','mod_lti_get_ltis_by_courses'],['page','pages','mod_page_get_pages_by_courses'],
 ['quiz','quizzes','mod_quiz_get_quizzes_by_courses'],['resource','resources','mod_resource_get_resources_by_courses'],
 ['scorm','scorms','mod_scorm_get_scorms_by_courses'],['survey','surveys','mod_survey_get_surveys_by_courses'],
 ['url','urls','mod_url_get_urls_by_courses'],['wiki','wikis','mod_wiki_get_wikis_by_courses'],
 ['workshop','workshops','mod_workshop_get_workshops_by_courses'],
];
for(const [moduleType,resultKey,functionName] of activityFamilies){
 READ_OPERATIONS[functionName]={input:course,scope:'course',moduleType,resultKey,purpose:`Metadata for currently visible ${moduleType} activities; not an attempt, launch, response, view or write operation`,params:(_c,a)=>({'courseids[0]':a.courseId as number})};
}
Object.freeze(READ_OPERATIONS);

const secretKey=/(?:password|passwd|wstoken|privatetoken|accesstoken|refreshtoken|autologin|sesskey|secret|authorization|^token$|^hash$)/i;
/** Bounded JSON, not an HTML rendering or instruction channel. */
export function sanitizeApiResult(input:unknown,site:string){
 let nodes=0,characters=0,truncated=false,redacted=0;
 function walk(v:unknown,depth:number,key=''):unknown{
  if(++nodes>10000||depth>12||characters>400000){truncated=true;return null;}
  if(secretKey.test(key.replace(/[_-]/g,''))){redacted++;return '[redacted]';}
  if(v===null||typeof v==='number'||typeof v==='boolean')return v;
  if(typeof v==='string'){
   let s=v;if(s.length>50000){s=s.slice(0,50000);truncated=true;}
   if(/^https?:\/\//i.test(s))s=safeContentUrl(s,site)??'[unsupported link]';
   else if(/<\/?[a-z][^>]*>/i.test(s)){try{s=readableContent(s,1,site,16000).text;}catch{s='[content exceeds safe text limit]';truncated=true;}}
   s=s.replace(/([?&](?:token|wstoken|sesskey|access_token|password)=)[^&\s<>"']*/gi,'$1[redacted]');characters+=s.length;return s;
  }
  if(Array.isArray(v)){if(v.length>250)truncated=true;return v.slice(0,250).map(x=>walk(x,depth+1));}
  if(v&&typeof v==='object'){
   const o=v as Record<string,unknown>;
   if(typeof o.name==='string'&&secretKey.test(o.name.replace(/[_-]/g,''))&&Object.hasOwn(o,'value')){redacted++;return {name:o.name,value:'[redacted]'};}
   const out:Record<string,unknown>={};for(const [k,value]of Object.entries(o)){if(['__proto__','constructor','prototype'].includes(k))continue;out[k]=walk(value,depth+1,k);}return out;
  }
  return null;
 }
 return {result:walk(input,0),truncated,redactedFields:redacted,untrusted:true};
}

export async function invokeReadOperation(client:MoodleClient,functionName:string,parameters:Args={}){
 if(!Object.hasOwn(READ_OPERATIONS,functionName))throw new Error('This API is not in the reviewed read-only registry. Advertisement or a get-prefix does not authorize it.');
 const spec=READ_OPERATIONS[functionName],args=spec.input.parse(parameters);
 if(functionName==='core_calendar_get_calendar_events'&&((args.to as number)<=(args.from as number)||(args.to as number)-(args.from as number)>90*86400))throw new Error('Calendar range must be positive and at most 90 days.');
 let modules:Awaited<ReturnType<typeof loadSections>>['sections'][number]['modules']=[];
 const warnings:ReadWarning[]=[];
 if(typeof args.courseId==='number'){
  const loaded=await loadSections(client,args.courseId);warnings.push(...loaded.warnings);modules=loaded.sections.flatMap(s=>s.modules);
  if(spec.scope==='module'&&!modules.some(m=>m.id===args.moduleId))throw new Error('The selected module is not visible in this course.');
 }
 const response=await readApi(client,functionName,spec.params(client,args),z.unknown());warnings.push(...response.warnings);
 let raw:unknown=response.value;
 if(spec.moduleType&&raw!==null){
  const rows=Array.isArray(raw)?raw:typeof raw==='object'&&raw!==null?(raw as Record<string,unknown>)[spec.resultKey!]:undefined;
  if(!Array.isArray(rows))return packet({functionName,scope:spec.scope,result:null,complete:false,rawMetadata:true,redactedFields:0,untrusted:true},'Moodle returned an unexpected activity metadata collection.',{[functionName]:'invalid_response'},[...warnings,warning('INVALID_METADATA_COLLECTION','No activity content was inferred.')]);
  const visible=modules.filter(m=>m.modname===spec.moduleType);
  raw=rows.filter(row=>{
   if(!row||typeof row!=='object')return false;const r=row as Record<string,unknown>,cid=r.course??r.courseid,cmid=r.coursemodule??r.cmid;
   if(cid!==undefined&&cid!==args.courseId)return false;
   return visible.some(m=>(cmid===m.id||m.instance===r.id)&&(m.instance===undefined||r.id===m.instance)&&(cmid===undefined||cmid===m.id));
  });
  if((raw as unknown[]).length!==rows.length)warnings.push(warning('ACTIVITY_ROWS_FILTERED','Metadata outside the current visible module context was excluded.',functionName));
 }
 const sanitized=sanitizeApiResult(raw,client.siteUrl);
 const complete=response.state==='available'&&!sanitized.truncated&&warnings.length===0;
 return packet({functionName,scope:spec.scope,...sanitized,complete,rawMetadata:true,upstreamPagination:{offset:args.offset??null,limit:args.limit??null,page:args.page??null},permissionVerified:response.state==='available'},`${functionName}: ${response.state}. ${spec.purpose}. Returned metadata is not a claim of complete workflow coverage.`,{[functionName]:response.state},warnings);
}
