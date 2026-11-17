import {z} from 'zod';
import {AppError,requireWorkspaceAdmin,document,documents,insert,replace,one,rows,write,database,uid,now,getAccessibleProject,postgresConnection,type WorkspaceContext} from './store';
import {secret,digest} from './auth';
import {canSeeProject,type Member,type Notification,type Project} from '../model';
import {parseCaseCsv,maxCaseCsvBytes} from '../qa-csv';
import {dashboardWidgetsSchema,defaultDashboard,type Dashboard} from '../qa-dashboard';
export type QAReport={id:string;version:number;title:string;description:string;projectId:string;build:string;environment:string;createdBy:string;createdAt:string;archived:boolean};
export type QACase={id:string;version:number;reportId:string;kind:'bug'|'test_case';title:string;steps:string;expected:string;actual:string;severity:'critical'|'high'|'medium'|'low';assigneeId:string;status:'open'|'in_progress'|'awaiting_verification'|'not_fixed'|'closed'|'reopened';result:'not_run'|'passed'|'failed'|'blocked';resolution:string;resource:string;createdBy:string;createdAt:string;updatedAt:string;deleted:boolean};
export type QAComment={id:string;version:number;caseId:string;reportId:string;memberId:string;body:string;createdAt:string;editedAt?:string;deleted?:boolean};
export type QAHistory={id:string;caseId:string;reportId:string;memberId:string;action:string;note:string;createdAt:string};
export type QAFile={id:string;caseId:string;reportId:string;memberId:string;name:string;key:string;size:number;createdAt:string};
export const requireQualityManager=(ctx:WorkspaceContext)=>{if(!['admin','qa'].includes(ctx.me.role))throw new AppError(403,'Only QA and Admin can manage reports, cases, and dashboards.')};
const text=z.string().trim().min(1).max(180),long=z.string().max(20000),identifier=z.string().min(1).max(120);
const reportInput=z.object({title:text,description:long.default(''),projectId:z.string().max(120).default(''),build:z.string().max(200).default(''),environment:z.string().max(500).default('')}).strict();
const caseInput=z.object({reportId:identifier,kind:z.enum(['bug','test_case']),title:text,steps:long.min(1),expected:long.min(1),actual:long.default(''),severity:z.enum(['critical','high','medium','low']),assigneeId:identifier}).strict();
export async function getAccessibleCase(ctx:WorkspaceContext,id:string){const c=await document<QACase>(ctx.workspace.id,'qa_case',id);if(ctx.me.role==='developer'&&c.assigneeId!==ctx.me.id)throw new AppError(403,'This case is assigned to another developer.');return c}
export async function getAccessibleReport(ctx:WorkspaceContext,id:string){const r=await document<QAReport>(ctx.workspace.id,'qa_report',id);if(ctx.me.role==='developer'&&!(await documents<QACase>(ctx.workspace.id,'qa_case')).some(c=>c.reportId===id&&c.assigneeId===ctx.me.id&&!c.deleted))throw new AppError(403,'No cases in this report are assigned to you.');return r}
async function recordQualityHistory(ctx:WorkspaceContext,reportId:string,caseId:string,action:string,note:string){await insert(ctx.workspace.id,'qa_history',{reportId,caseId,memberId:ctx.me.id,action,note,createdAt:now()})}
function caseNotifications(ctx:WorkspaceContext,c:QACase,title:string,members:Pick<Member,'id'|'role'>[]){
 return members.filter(m=>m.id!==ctx.me.id&&(m.id===c.assigneeId||m.id===c.createdBy||m.role==='admin')).map(m=>({
  memberId:m.id,caseId:c.id,reportId:c.reportId,taskId:'',title:c.title,body:title,
  read:false,bookmarked:false,archived:false,createdAt:now(),
 }));
}
async function notifyCaseParticipants(ctx:WorkspaceContext,c:QACase,title:string){const members=await rows<Member>('SELECT id,role FROM members WHERE workspace_id=?',ctx.workspace.id);for(const notice of caseNotifications(ctx,c,title,members))await insert(ctx.workspace.id,'notification',notice)}
function newCase(ctx:WorkspaceContext,input:z.infer<typeof caseInput>):QACase {
 const stamp=now();
 return {...input,id:uid(),status:'open',result:'not_run',resolution:'',resource:'',createdBy:ctx.me.id,createdAt:stamp,updatedAt:stamp,deleted:false,version:1};
}
async function validateCaseAssignee(ctx:WorkspaceContext,id:string){const m=await one<Member>('SELECT id,role FROM members WHERE id=? AND workspace_id=?',id,ctx.workspace.id);if(!m||!['developer','admin'].includes(m.role))throw new AppError(400,'Assign this case to a Developer or Admin in this workspace.')}

const importReceiptSchema = z.object({memberId:z.string(),fingerprint:z.string(),count:z.number().int().positive()});

async function importCases(ctx:WorkspaceContext,data:unknown) {
 requireQualityManager(ctx);
 const {reportId,assigneeId,csv,importId}=z.object({
  reportId:identifier,assigneeId:identifier,csv:z.string().max(maxCaseCsvBytes),importId:z.string().uuid(),
 }).strict().parse(data);
 const report=await getAccessibleReport(ctx,reportId);
 if(report.archived)throw new AppError(400,'Restore the report before importing cases.');
 const workspaceId=ctx.workspace.id;
 const receiptId=`qa_import_${importId}`;
 const fingerprint=await digest(JSON.stringify([reportId,assigneeId,csv]));
 const findReceipt=async()=>{
  const record=await one<{data:string}>('SELECT data FROM records WHERE workspace_id=? AND kind=? AND id=?',workspaceId,'qa_history',receiptId);
  if(!record)return null;
  const saved=importReceiptSchema.parse(JSON.parse(record.data));
  if(saved.memberId!==ctx.me.id||saved.fingerprint!==fingerprint)throw new AppError(409,'This import has already been submitted. Choose the file again.');
  return {count:saved.count};
 };
 const receipt=await findReceipt();
 if(receipt)return receipt;

 let csvRows;
 try {csvRows=parseCaseCsv(csv)} catch(error) {
  throw new AppError(400,error instanceof Error?error.message:'Invalid CSV file.');
 }
 const members=await rows<Member & {disabled:number}>('SELECT m.id,m.name,m.email,m.role,coalesce(a.disabled,0) AS disabled FROM members m LEFT JOIN accounts a ON a.id=m.user_id WHERE m.workspace_id=?',workspaceId);
 const developers=members.filter(m=>!m.disabled&&['developer','admin'].includes(m.role));
 if(!developers.some(m=>m.id===assigneeId))throw new AppError(400,'Choose an active Developer or Admin as the default assignee.');
 const cases=csvRows.map(({line,developer,...fields})=>{
  let rowAssignee=assigneeId;
  if(developer){
   const reference=developer.toLowerCase();
   const byEmail=developers.find(m=>m.email.toLowerCase()===reference);
   const byName=developers.filter(m=>m.name.toLowerCase()===reference);
   const match=byEmail??(byName.length===1?byName[0]:undefined);
   if(!match)throw new AppError(400,`Line ${line}: use the email of an active Developer or Admin in this workspace.`);
   rowAssignee=match.id;
  }
  const parsed=caseInput.safeParse({...fields,reportId,assigneeId:rowAssignee});
  if(!parsed.success){
   const issue=parsed.error.issues[0];
   throw new AppError(400,`Line ${line} (${String(issue.path[0])}): ${issue.message}`);
  }
  return newCase(ctx,parsed.data);
 });

 const stamp=now();
 const records: {kind:string;data:Record<string,unknown>}[]=[{
  kind:'qa_history',data:{id:receiptId,reportId,caseId:'',memberId:ctx.me.id,action:'Cases imported from CSV',
   note:`${cases.length} ${cases.length===1?'case':'cases'} created.`,createdAt:stamp,count:cases.length,fingerprint},
 }];
 for(const c of cases){
  records.push({kind:'qa_case',data:c},{
   kind:'qa_history',data:{id:uid(),reportId,caseId:c.id,memberId:ctx.me.id,action:'Case opened',note:c.title,createdAt:stamp},
  });
  for(const notice of caseNotifications(ctx,c,'A case was assigned to you',members)){
   records.push({kind:'notification',data:{...notice,id:uid()}});
  }
 }
 const db=database();
 const statements=[];
 // Keep each statement below D1's bound parameter limit.
 for(let offset=0;offset<records.length;offset+=20){
  const group=records.slice(offset,offset+20);
  const values=group.map(()=>'(?,?,?,?,1,?)').join(',');
  statements.push(db.prepare(`INSERT INTO records(id,workspace_id,kind,data,version,updated_at) VALUES ${values}`)
   .bind(...group.flatMap(({kind,data})=>[data.id,workspaceId,kind,JSON.stringify(data),stamp])));
 }
 try {await db.batch(statements)} catch(error) {
  const retry=await findReceipt();
  if(retry)return retry;
  throw error;
 }
 return {count:cases.length};
}
type QualityNotification = Notification & {caseId?: string};

export async function loadQualityWorkspace({workspace,me,available}:WorkspaceContext) {
 const workspaceId = workspace.id;
 const [allCases,allReports,projects,comments,history,files,dashboards,members,notifications] = await Promise.all([
  documents<QACase>(workspaceId,'qa_case'),
  documents<QAReport>(workspaceId,'qa_report'),
  documents<Project>(workspaceId,'project'),
  documents<QAComment>(workspaceId,'qa_comment'),
  documents<QAHistory>(workspaceId,'qa_history'),
  documents<QAFile>(workspaceId,'qa_attachment'),
  documents<Dashboard>(workspaceId,'qa_dashboard'),
  rows<Member & {disabled:number}>('SELECT m.id,m.name,m.email,m.role,m.user_id as "userId",m.color,coalesce(a.disabled,0) as disabled FROM members m LEFT JOIN accounts a ON a.id=m.user_id WHERE m.workspace_id=?',workspaceId),
  documents<QualityNotification>(workspaceId,'notification'),
 ]);
 const isDeveloper = me.role === 'developer';
 const cases = isDeveloper ? allCases.filter(testCase => testCase.assigneeId === me.id) : allCases;
 const caseIds = new Set(cases.map(testCase => testCase.id));
 const assignedReportIds = new Set(cases.filter(testCase => !testCase.deleted).map(testCase => testCase.reportId));
 const reports = isDeveloper ? allReports.filter(report => assignedReportIds.has(report.id)) : allReports;
 const visibleReportIds = new Set(reports.map(report => report.id));

 function canSeeRelatedRecord(record:{caseId?:string;reportId:string}) {
  if (record.caseId) return caseIds.has(record.caseId);
  if (record.reportId) return visibleReportIds.has(record.reportId);
  return me.role === 'admin';
 }

 return {
  projects:projects.filter(project => canSeeProject(project,me)).map(({id,name}) => ({id,name})),
  reports,cases,
  comments:comments.filter(canSeeRelatedRecord),
  history:history.filter(canSeeRelatedRecord).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),
  files:files.filter(canSeeRelatedRecord),
  dashboard:dashboards[0] ?? defaultDashboard,
  members,me,workspace,workspaces:available,
  notifications:notifications.filter(notice => notice.memberId === me.id && notice.caseId && caseIds.has(notice.caseId)),
 };
}

export async function executeQualityAction(ctx:WorkspaceContext,input:unknown,origin:string){const e=z.object({action:z.string(),id:identifier.optional(),version:z.number().int().positive().optional(),data:z.unknown().optional()}).strict().parse(input);const {action,id,version}=e;const data=e.data;
 if(action==='report.save'){requireQualityManager(ctx);const v=reportInput.parse(data);if(v.projectId)await getAccessibleProject(ctx,v.projectId);if(id){const old=await getAccessibleReport(ctx,id);if(!version)throw new AppError(400,'Report version required.');await replace(ctx.workspace.id,'qa_report',id,{...old,...v},version);await recordQualityHistory(ctx,id,'','Report updated',v.title);return {id}}const rid=await insert(ctx.workspace.id,'qa_report',{...v,createdBy:ctx.me.id,createdAt:now(),archived:false});await recordQualityHistory(ctx,rid,'','Report created',v.title);return {id:rid}}
 if(action==='report.archive'){requireQualityManager(ctx);if(!version)throw new AppError(400,'Report version required.');const r=await getAccessibleReport(ctx,identifier.parse(id));const archived=z.object({archived:z.boolean()}).parse(data).archived;await replace(ctx.workspace.id,'qa_report',r.id,{...r,archived},version);await recordQualityHistory(ctx,r.id,'',archived?'Report archived':'Report restored',r.title);return {id}}
 if(action==='case.save'){requireQualityManager(ctx);const v=caseInput.parse(data);const report=await getAccessibleReport(ctx,v.reportId);if(report.archived)throw new AppError(400,'Restore the report before editing its cases.');await validateCaseAssignee(ctx,v.assigneeId);if(id){const c=await getAccessibleCase(ctx,id);if(!version)throw new AppError(400,'Case version required.');if(c.reportId!==v.reportId)throw new AppError(400,'A case cannot move between reports.');const next={...c,...v,updatedAt:now()};await replace(ctx.workspace.id,'qa_case',id,next,version);await recordQualityHistory(ctx,c.reportId,id,'Case updated',c.assigneeId!==v.assigneeId?'Case reassigned':v.title);await notifyCaseParticipants(ctx,next,'Case details or assignment updated');return {id}}const c=newCase(ctx,v);await insert(ctx.workspace.id,'qa_case',c);await recordQualityHistory(ctx,v.reportId,c.id,'Case opened',v.title);await notifyCaseParticipants(ctx,c,'A case was assigned to you');return {id:c.id}}
 if(action==='case.import')return importCases(ctx,data);
 if(['case.respond','case.transition','case.delete','case.execution'].includes(action)){const c=await getAccessibleCase(ctx,identifier.parse(id));if(!version)throw new AppError(400,'Case version required.');const r=await getAccessibleReport(ctx,c.reportId);if(r.archived||c.deleted&&action!=='case.delete')throw new AppError(400,'Restore this report/case before updating it.');let next={...c,updatedAt:now()},note='',label='';
 if(action==='case.respond'){if(!['admin','developer'].includes(ctx.me.role))throw new AppError(403,'Only the assigned Developer or Admin can submit a fix response.');const v=z.object({fixed:z.boolean(),note:long.trim().min(1),resource:z.union([z.literal(''),z.string().url().max(2000)]).default('')}).strict().parse(data);if(v.resource&&!/^https?:\/\//i.test(v.resource))throw new AppError(400,'Resource links must use HTTP or HTTPS.');if(c.status==='closed')throw new AppError(400,'QA must reopen a closed case before another fix response.');next={...next,status:v.fixed?'awaiting_verification':'not_fixed',resolution:v.note,resource:v.resource};note=v.note+(v.resource?`\nResource: ${v.resource}`:'');label=v.fixed?'Developer marked fixed — awaiting QA':'Developer marked not fixed';}
 if(action==='case.transition'){const v=z.object({status:z.enum(['in_progress','closed','reopened']),note:long.trim().min(1)}).strict().parse(data);if(v.status==='in_progress'){if(!['admin','developer'].includes(ctx.me.role))throw new AppError(403,'Only a Developer or Admin can start development.');if(!['open','reopened','not_fixed'].includes(c.status))throw new AppError(400,'This case cannot move to In progress.')}else{requireQualityManager(ctx);if(v.status==='closed'&&c.kind==='bug'&&c.status!=='awaiting_verification'&&ctx.me.role!=='admin')throw new AppError(400,'A bug must be marked fixed by a developer before QA closes it.');if(v.status==='closed'&&c.status==='closed')throw new AppError(400,'This case is already closed.')}next={...next,status:v.status,result:v.status==='closed'?'passed':v.status==='reopened'?'failed':c.result};note=v.note;label=v.status==='closed'?'QA verification passed — case closed':v.status==='reopened'?'QA reopened case':'Development started';}
 if(action==='case.execution'){requireQualityManager(ctx);const v=z.object({result:z.enum(['not_run','passed','failed','blocked']),note:long.trim().min(1)}).strict().parse(data);next={...next,result:v.result};note=v.note;label='Test execution recorded';}
 if(action==='case.delete'){requireQualityManager(ctx);const v=z.object({deleted:z.boolean(),note:long.trim().min(1)}).strict().parse(data);next={...next,deleted:v.deleted};note=v.note;label=v.deleted?'Case moved to trash':'Case restored';}
 await saveCaseWithHistory(ctx,next,version,label,note);await notifyCaseParticipants(ctx,next,label);return {id};}
 if(action==='comment.save'){const v=z.object({reportId:identifier,caseId:z.string().max(120).default(''),body:long.trim().min(1)}).strict().parse(data);await getAccessibleReport(ctx,v.reportId);if(v.caseId){const c=await getAccessibleCase(ctx,v.caseId);if(c.reportId!==v.reportId)throw new AppError(400,'Case/report mismatch.');}if(id){if(!version)throw new AppError(400,'Comment version required.');const old=await document<QAComment>(ctx.workspace.id,'qa_comment',id);await getAccessibleReport(ctx,old.reportId);if(old.caseId)await getAccessibleCase(ctx,old.caseId);if(old.memberId!==ctx.me.id&&ctx.me.role!=='admin')throw new AppError(403,'You can only edit your own comments.');if(old.reportId!==v.reportId||old.caseId!==v.caseId)throw new AppError(400,'Comment context cannot change.');await replace(ctx.workspace.id,'qa_comment',id,{...old,body:v.body,editedAt:now()},version);await recordQualityHistory(ctx,v.reportId,v.caseId,'Comment edited',v.body);return {id}}const cid=await insert(ctx.workspace.id,'qa_comment',{...v,memberId:ctx.me.id,createdAt:now()});await recordQualityHistory(ctx,v.reportId,v.caseId,'Comment added',v.body);return {id:cid}}
 if(action==='comment.delete'){if(!version)throw new AppError(400,'Comment version required.');const c=await document<QAComment>(ctx.workspace.id,'qa_comment',identifier.parse(id));await getAccessibleReport(ctx,c.reportId);if(c.caseId)await getAccessibleCase(ctx,c.caseId);if(c.memberId!==ctx.me.id&&ctx.me.role!=='admin')throw new AppError(403,'You can only remove your own comments.');await replace(ctx.workspace.id,'qa_comment',c.id,{...c,deleted:true,body:'[Removed]'},version);await recordQualityHistory(ctx,c.reportId,c.caseId,'Comment removed','Comment retained as a history entry.');return {id}}
 if(action==='dashboard.save'){
  requireQualityManager(ctx);
  const input=z.object({title:text,widgets:dashboardWidgetsSchema}).strict().parse(data);
  const workspaceId=ctx.workspace.id;
  const old=(await documents<Dashboard>(workspaceId,'qa_dashboard'))[0];
  if(old){
   if(!version)throw new AppError(409,'The dashboard changed in another session. Refresh and try again.');
   await replace(workspaceId,'qa_dashboard',old.id,input,version);
  }else{
   const dashboardId=`dashboard_${workspaceId}`;
   const created=await write(
    'INSERT INTO records(id,workspace_id,kind,data,version,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING',
    dashboardId,workspaceId,'qa_dashboard',JSON.stringify(input),now(),
   );
   if(!created.meta.changes)throw new AppError(409,'The dashboard changed in another session. Refresh and try again.');
  }
  await recordQualityHistory(ctx,'','','Dashboard configuration updated',input.title);
  return {};
 }
 if(action.startsWith('user.')){requireWorkspaceAdmin(ctx);return executeMemberAction(ctx,action,id,data,origin)}
 throw new AppError(400,'Unknown QA action.');}
async function executeMemberAction(ctx:WorkspaceContext,action:string,id:string|undefined,data:unknown,origin:string){
 if(action==='user.invite'){const v=z.object({name:text,email:z.string().trim().email().max(200).transform(s=>s.toLowerCase()),role:z.enum(['admin','developer','qa'])}).strict().parse(data);const member=await one<Member>('SELECT id FROM members WHERE workspace_id=? AND lower(email)=?',ctx.workspace.id,v.email);if(member)throw new AppError(409,'This email is already a workspace member.');const mid=uid();await write('INSERT INTO members(id,workspace_id,email,name,role,color) VALUES(?,?,?,?,?,?)',mid,ctx.workspace.id,v.email,v.name,v.role,'#668ca8');const existing=await one<{id:string}>('SELECT id FROM accounts WHERE email=?',v.email);if(existing){await write('UPDATE members SET user_id=? WHERE id=?',existing.id,mid);await recordQualityHistory(ctx,'','','Member added',`${v.email} (${v.role})`);return {id:mid,existing:true}}const token=secret();await write('INSERT INTO account_invites(hash,workspace_id,email,name,role,purpose,expires_at,created_by) VALUES(?,?,?,?,?,?,?,?)',await digest(token),ctx.workspace.id,v.email,v.name,v.role,'invite',Date.now()+48*3600000,ctx.me.id);await recordQualityHistory(ctx,'','','User invited',`${v.email} (${v.role})`);return {id:mid,link:`${origin}/login?token=${token}`};}
 const m=await one<Member>('SELECT id,user_id as "userId",email,name,role FROM members WHERE workspace_id=? AND id=?',ctx.workspace.id,identifier.parse(id));if(!m)throw new AppError(404,'Member not found.');if(m.userId===ctx.workspace.ownerId&&action!=='user.inviteLink')throw new AppError(400,'The workspace owner cannot be changed, disabled, removed, or reset here.');
 if(action==='user.role'){const role=z.object({role:z.enum(['admin','developer','qa'])}).parse(data).role;if(role==='qa'&&(await documents<QACase>(ctx.workspace.id,'qa_case')).some(c=>!c.deleted&&c.status!=='closed'&&c.assigneeId===m.id))throw new AppError(400,'Reassign this member’s open cases before changing them to QA.');await write('UPDATE members SET role=? WHERE id=?',role,m.id);await recordQualityHistory(ctx,'','','User role changed',`${m.email}: ${role}`);return {id}}
 if(action==='user.remove'){if((await documents<QACase>(ctx.workspace.id,'qa_case')).some(c=>!c.deleted&&c.status!=='closed'&&c.assigneeId===m.id))throw new AppError(400,'Reassign open cases before removing this member.');await write('DELETE FROM members WHERE id=? AND workspace_id=?',m.id,ctx.workspace.id);await write('DELETE FROM account_invites WHERE email=? AND workspace_id=?',m.email,ctx.workspace.id);await recordQualityHistory(ctx,'','','Member removed',m.email);return {id}}
 if(action==='user.reset'&&!m.userId)throw new AppError(400,'This user has not activated an account. Send an invitation link instead.');
 if(['user.reset','user.disable','user.enable'].includes(action)&&m.userId){const memberships=await one<{n:number}>('SELECT count(*) as n FROM members WHERE user_id=?',m.userId);if((memberships?.n||0)>1)throw new AppError(403,'This account belongs to multiple workspaces. Its owner must change its password; remove workspace membership to revoke access.');}
 if(action==='user.disable'||action==='user.enable'){if(!m.userId)throw new AppError(400,'This invitation has not been accepted.');await database().batch([database().prepare('UPDATE accounts SET disabled=? WHERE id=?').bind(action==='user.disable'?1:0,m.userId),database().prepare('DELETE FROM sessions WHERE account_id=?').bind(m.userId)]);await recordQualityHistory(ctx,'','',action==='user.disable'?'User disabled':'User enabled',m.email);return {id}}
 if(action==='user.reset'||action==='user.inviteLink'){if(action==='user.inviteLink'&&m.userId)throw new AppError(400,'This user already has an account.');const token=secret();await write('DELETE FROM account_invites WHERE email=? AND workspace_id=?',m.email,ctx.workspace.id);await write('INSERT INTO account_invites(hash,workspace_id,email,name,role,purpose,expires_at,created_by) VALUES(?,?,?,?,?,?,?,?)',await digest(token),ctx.workspace.id,m.email,m.name,m.role,action==='user.reset'?'reset':'invite',Date.now()+(action==='user.reset'?3600000:48*3600000),ctx.me.id);await recordQualityHistory(ctx,'','',action==='user.reset'?'Password reset link generated':'Invitation renewed',m.email);return {link:`${origin}/login?token=${token}`}}
 throw new AppError(400,'Unsupported user action.');}

// The case update and its audit entry commit together. A stale version inserts
// neither a state change nor an audit entry.
async function saveCaseWithHistory(ctx:WorkspaceContext,next:QACase,version:number,label:string,note:string){
 const stamp=now(),eventId=uid();
 const event={id:eventId,reportId:next.reportId,caseId:next.id,memberId:ctx.me.id,action:label,note,createdAt:stamp};
 if(postgresConnection()){
  const result = await write(
   'WITH updated AS (UPDATE records SET data=?,version=version+1,updated_at=? WHERE workspace_id=? AND kind=? AND id=? AND version=? RETURNING id) INSERT INTO records(id,workspace_id,kind,data,version,updated_at) SELECT ?,?,?,?,1,? FROM updated',
   JSON.stringify(next),stamp,ctx.workspace.id,'qa_case',next.id,version,
   eventId,ctx.workspace.id,'qa_history',JSON.stringify(event),stamp,
  );
  if(!result.meta.changes)throw new AppError(409,'This case changed in another session. Refresh and try again.');
  return;
 }
 const result=await database().batch([
  database().prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE workspace_id=? AND kind=? AND id=? AND version=?').bind(JSON.stringify(next),stamp,ctx.workspace.id,'qa_case',next.id,version),
  database().prepare('INSERT INTO records(id,workspace_id,kind,data,version,updated_at) SELECT ?,?,?,?,1,? WHERE changes()=1').bind(eventId,ctx.workspace.id,'qa_history',JSON.stringify(event),stamp),
 ]);
 if(!result[0].meta.changes)throw new AppError(409,'This case changed in another session. Refresh and try again.');
}
