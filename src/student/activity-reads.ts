import { z } from 'zod';
import type { ReadOperation } from './safe-api.js';
import { idSchema } from './result.js';
const base={courseId:idSchema,moduleId:idSchema};
const paged={offset:z.number().int().min(0).max(100000).optional(),limit:z.number().int().min(1).max(100).optional()};
const pages={page:z.number().int().min(0).max(10000).optional(),limit:z.number().int().min(1).max(100).optional()};
const attempt=z.number().int().min(0).max(10000);
const int=(a:Record<string,unknown>,key:string,fallback:number)=>typeof a[key]==='number'?a[key] as number:fallback;
const instance=(a:Record<string,unknown>)=>a._resolvedInstanceId as number;
const registry:Record<string,ReadOperation>={};
function add(name:string,type:string,purpose:string,input:z.ZodRawShape,params:ReadOperation['params']){
 registry[name]={input:z.object({...base,...input}).strict(),scope:'module',instanceType:type,purpose,params};
}
for(const [name,type,key]of [
 ['mod_choice_get_choice_options','choice','choiceid'],['mod_choice_get_choice_results','choice','choiceid'],
 ['mod_data_get_data_access_information','data','databaseid'],['mod_data_get_fields','data','databaseid'],
 ['mod_feedback_get_feedback_access_information','feedback','feedbackid'],['mod_feedback_get_items','feedback','feedbackid'],['mod_feedback_get_last_completed','feedback','feedbackid'],
 ['mod_lesson_get_lesson_access_information','lesson','lessonid'],['mod_scorm_get_scorm_access_information','scorm','scormid'],['mod_scorm_get_scorm_scoes','scorm','scormid'],
 ['mod_survey_get_questions','survey','surveyid'],['mod_workshop_get_workshop_access_information','workshop','workshopid'],
 ['mod_quiz_get_quiz_access_information','quiz','quizid'],['mod_quiz_get_quiz_required_qtypes','quiz','quizid'],['mod_wiki_get_subwikis','wiki','wikiid'],
]as const)add(name,type,'Read permitted '+type+' configuration/content; no activity view, attempt launch or response write',{},(_c,a)=>({[key]:instance(a)}));
add('mod_data_get_entries','data','Read a bounded page of database entries visible under Moodle groups/entry restrictions',pages,(_c,a)=>({databaseid:instance(a),groupid:0,returncontents:true,order:'ASC',page:int(a,'page',0),perpage:int(a,'limit',20)}));
for(const name of ['mod_lesson_get_user_grade','mod_lesson_get_user_timers']as const)add(name,'lesson','Read existing current-student Lesson grade/timers without launching an attempt',{},(c,a)=>({lessonid:instance(a),userid:c.userId}));
for(const name of ['mod_lesson_get_user_attempt_grade','mod_lesson_get_content_pages_viewed']as const)add(name,'lesson','Read existing current-student Lesson attempt history, not get_page_data or launch',{attempt},(c,a)=>({lessonid:instance(a),lessonattempt:a.attempt as number,userid:c.userId}));
add('mod_scorm_get_scorm_attempt_count','scorm','Read current-student SCORM attempt count; no tracks inserted',{},(c,a)=>({scormid:instance(a),userid:c.userId,ignoremissingcompletion:false}));
for(const name of ['mod_workshop_get_user_plan','mod_workshop_get_reviewer_assessments','mod_workshop_get_grades']as const)add(name,'workshop','Read current-student Workshop plan/review allocations/released grades only',{},(c,a)=>({workshopid:instance(a),userid:c.userId}));
add('mod_workshop_get_submissions','workshop','Read only the current student’s visible Workshop submissions in bounded pages',pages,(c,a)=>({workshopid:instance(a),userid:c.userId,groupid:0,page:int(a,'page',0),perpage:int(a,'limit',20)}));
for(const name of ['mod_quiz_get_user_best_grade','mod_quiz_get_combined_review_options']as const)add(name,'quiz','Read current-student quiz grade/review-policy metadata without opening any active attempt',{},(c,a)=>({quizid:instance(a),userid:c.userId}));
add('mod_quiz_get_user_attempts','quiz','List finished current-student non-preview quiz attempts; no active attempt access',{},(c,a)=>({quizid:instance(a),userid:c.userId,status:'finished',includepreviews:false}));
add('mod_chat_get_sessions','chat','Read completed chat session metadata under Moodle permissions; no chat login or presence updates',{},(_c,a)=>({chatid:instance(a),groupid:0,showall:false}));
add('mod_chat_get_session_messages','chat','Read messages from a historical chat time range; no live chat session or presence token',{from:z.number().int().min(0),to:z.number().int().min(1)},(_c,a)=>({chatid:instance(a),sessionstart:a.from as number,sessionend:a.to as number,groupid:0}));
for(const name of ['mod_glossary_get_categories','mod_glossary_get_authors']as const)add(name,'glossary','Read visible glossary categories/authors with bounded pagination',paged,(_c,a)=>({id:instance(a),from:int(a,'offset',0),limit:int(a,'limit',20)}));
add('mod_glossary_get_entries_by_letter','glossary','Read glossary entries by letter; never include entries awaiting approval beyond Moodle’s user permissions',{...paged,letter:z.string().regex(/^(ALL|SPECIAL|[A-Za-z])$/).optional()},(_c,a)=>({id:instance(a),letter:typeof a.letter==='string'?a.letter:'ALL',from:int(a,'offset',0),limit:int(a,'limit',20),'options[includenotapproved]':false}));
add('mod_glossary_get_entries_by_date','glossary','Read visible glossary entries ordered by update/creation date',{...paged,order:z.enum(['CREATION','UPDATE']).optional(),sort:z.enum(['ASC','DESC']).optional()},(_c,a)=>({id:instance(a),order:typeof a.order==='string'?a.order:'UPDATE',sort:typeof a.sort==='string'?a.sort:'DESC',from:int(a,'offset',0),limit:int(a,'limit',20),'options[includenotapproved]':false}));
add('mod_glossary_get_entries_by_search','glossary','Search permitted glossary definitions, not an external search service',{...paged,query:z.string().min(1).max(200)},(_c,a)=>({id:instance(a),query:a.query as string,fullsearch:true,order:'CONCEPT',sort:'ASC',from:int(a,'offset',0),limit:int(a,'limit',20),'options[includenotapproved]':false}));
add('mod_glossary_get_entries_by_term','glossary','Read a glossary concept or alias',{...paged,term:z.string().min(1).max(200)},(_c,a)=>({id:instance(a),term:a.term as string,from:int(a,'offset',0),limit:int(a,'limit',20),'options[includenotapproved]':false}));
add('mod_wiki_get_subwiki_pages','wiki','Read current student’s visible Wiki pages/content; Moodle may refresh its content cache, but no view event or page edit is invoked',{},(c,a)=>({wikiid:instance(a),groupid:-1,userid:c.userId,'options[includecontent]':true,'options[sortby]':'title','options[sortdirection]':'ASC'}));
add('mod_wiki_get_subwiki_files','wiki','Read current student’s visible Wiki attachment metadata, not an edit draft',{},(c,a)=>({wikiid:instance(a),groupid:-1,userid:c.userId}));
export const ACTIVITY_READS=Object.freeze(registry);
