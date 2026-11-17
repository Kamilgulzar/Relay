import {executeQualityAction} from './qa';
import {z} from 'zod';
import {projectInput,taskInput,taskPatch,identifier,assertDateRange,assertNoCycle,date} from '../validation';
import type {Task,Rule,Comment} from '../model';
import {AppError,requireWorkspaceAdmin,requireWorkspaceWriteRole,document,documents,insert,replace,getAccessibleProject,getAccessibleTask,recordActivity,uid,now,write,rows,database,type WorkspaceContext} from './store';

const entityKind = z.enum(['team','portfolio','goal','rule','form','document']);
const projectReference = z.object({projectId: z.string().max(120).optional()});
const named=z.string().trim().min(1,'Please enter a name.').max(180);
const entitySchemas={
 team:z.object({name:named,description:z.string().max(10000).default(''),memberIds:z.array(identifier).max(200).default([])}),
 portfolio:z.object({name:named,description:z.string().max(10000).default(''),projectIds:z.array(identifier).max(200).default([]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#de795d')}),
 goal:z.object({name:named,description:z.string().max(10000).default(''),ownerId:identifier,dueDate:date.default(''),progress:z.number().min(0).max(100).default(0),target:z.number().positive().max(1e9).default(100),current:z.number().min(0).max(1e9).default(0),status:z.enum(['on_track','at_risk','off_track','complete']).default('on_track'),projectIds:z.array(identifier).max(100).default([])}),
 rule:z.object({projectId:identifier,name:named,trigger:z.enum(['completed','created','moved']),action:z.enum(['set_priority','set_status','assign','move']),value:z.string().min(1).max(120),enabled:z.boolean().default(true)}),
 form:z.object({projectId:identifier,name:named,description:z.string().max(10000).default(''),fields:z.array(z.object({label:named,required:z.boolean(),type:z.enum(['text','textarea','date'])})).min(1).max(20)}),
 document:z.object({projectId:identifier,title:named,body:z.string().max(60000)}),
};
async function validateWorkspaceMembers(ctx:WorkspaceContext,ids:string[]){if(!ids.length)return;const available=await rows<{id:string}>('SELECT id FROM members WHERE workspace_id=?',ctx.workspace.id);if(ids.some(id=>!available.some(m=>m.id===id)))throw new AppError(400,'Choose a member of this workspace.')}
async function validateTask(ctx:WorkspaceContext,task:Task){
 assertDateRange(task.startDate,task.dueDate);await validateWorkspaceMembers(ctx,[task.assigneeId,...task.collaboratorIds].filter(Boolean));
 if(task.projectId){const project=await getAccessibleProject(ctx,task.projectId);if(task.sectionId&&!project.sections.some(s=>s.id===task.sectionId))throw new AppError(400,'Choose a section in this project.')}
 else if(task.sectionId)throw new AppError(400,'Personal tasks cannot have a project section.');
 for(const id of task.projectIds)await getAccessibleProject(ctx,id);
 if(task.parentId){const parent=await getAccessibleTask(ctx,task.parentId);if(parent.parentId===task.id||parent.id===task.id)throw new AppError(400,'A task cannot be its own parent.');if(parent.projectId!==task.projectId)throw new AppError(400,'Subtasks must use their parent’s project.')}
 const all=await documents<Task>(ctx.workspace.id,'task');
 const ancestors=new Set([task.id]);let parentId=task.parentId;while(parentId){if(ancestors.has(parentId))throw new AppError(400,'This parent would create a subtask cycle.');ancestors.add(parentId);parentId=all.find(t=>t.id===parentId)?.parentId||'';}
 for(const id of task.dependencies){if(!all.some(t=>t.id===id&&!t.deleted))throw new AppError(400,'A dependency is unavailable.');await getAccessibleTask(ctx,id)}
 assertNoCycle(task.id,task.dependencies,all);
 if(task.projectId){const project=await getAccessibleProject(ctx,task.projectId);for(const field of project.fields){const value=task.custom[field.id];if(!value)continue;if(field.type==='number'&&!Number.isFinite(Number(value)))throw new AppError(400,`${field.name} must be a number.`);if(field.type==='select'&&!field.options.includes(value))throw new AppError(400,`Choose a valid ${field.name} option.`);if(field.type==='date')date.parse(value)}}
}
async function applyProjectRules(ctx:WorkspaceContext,task:Task,trigger:Rule['trigger']){
 const rules=(await documents<Rule>(ctx.workspace.id,'rule')).filter(r=>r.projectId===task.projectId&&r.enabled&&r.trigger===trigger);
 for(const rule of rules){if(rule.action==='set_priority')task.priority=z.enum(['none','low','medium','high','urgent']).parse(rule.value);if(rule.action==='set_status')task.status=z.enum(['on_track','at_risk','off_track','on_hold']).parse(rule.value);if(rule.action==='assign'){await validateWorkspaceMembers(ctx,[rule.value]);task.assigneeId=rule.value}if(rule.action==='move'){const project=await getAccessibleProject(ctx,task.projectId);if(!project.sections.some(s=>s.id===rule.value))throw new AppError(400,'An automation refers to a missing section.');task.sectionId=rule.value}}
 return task;
}
function nextOccurrenceDate(value:string,recurrence:string){if(!value)return '';const d=new Date(value+'T12:00:00Z');if(recurrence==='monthly'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end))}else d.setUTCDate(d.getUTCDate()+(recurrence==='weekly'?7:1));return d.toISOString().slice(0,10)}
async function createTask(ctx:WorkspaceContext,data:unknown){const input=taskInput.parse(data);let task:Task={...input,id:uid(),projectIds:[...new Set([input.projectId,...input.projectIds].filter(Boolean))],completedAt:input.completed?now():'',createdBy:ctx.me.id,createdAt:now(),deleted:false,version:1};await validateTask(ctx,task);task=await applyProjectRules(ctx,task,'created');await insert(ctx.workspace.id,'task',{...task});await recordActivity(ctx,task,'created this task');return task.id}

export async function executeWorkspaceAction(ctx:WorkspaceContext,input:unknown){
 const envelope=z.object({action:z.string(),id:z.string().max(120).optional(),data:z.unknown().optional(),version:z.number().int().positive().optional(),kind:z.string().optional()}).strict().parse(input);
 const {action,id,data,version}=envelope;
 if(action==='notification.update'){const n=await document<{memberId:string}>(ctx.workspace.id,'notification',identifier.parse(id));if(n.memberId!==ctx.me.id)throw new AppError(403,'This notification belongs to someone else.');const patch=z.object({read:z.boolean().optional(),archived:z.boolean().optional(),bookmarked:z.boolean().optional()}).strict().parse(data);await replace(ctx.workspace.id,'notification',id!,{...n,...patch});return {id}}
 if(action==='preference.save'){const p=z.object({theme:z.enum(['light','dark','system']),weekStart:z.enum(['monday','sunday']),emailNotifications:z.boolean(),compact:z.boolean(),name:z.string().trim().min(1).max(100)}).parse(data);const pid=`pref_${ctx.me.id}`;const existing=await rows('SELECT id FROM records WHERE id=? AND workspace_id=?',pid,ctx.workspace.id);if(existing.length)await replace(ctx.workspace.id,'preference',pid,{...p,memberId:ctx.me.id});else await insert(ctx.workspace.id,'preference',{...p,id:pid,memberId:ctx.me.id});await write('UPDATE members SET name=? WHERE id=? AND workspace_id=?',p.name,ctx.me.id,ctx.workspace.id);return {id:pid}}
 requireWorkspaceWriteRole(ctx);
 if(ctx.me.role==='developer'&&!['task.update','comment.create','comment.update','comment.delete'].includes(action))throw new AppError(403,'Developers can update assigned work and reply to reports; project and workspace management require QA or Admin.');
 if(ctx.me.role==='developer'&&action==='task.update'){const task=await getAccessibleTask(ctx,identifier.parse(id));if(task.assigneeId!==ctx.me.id)throw new AppError(403,'Only assigned work can be updated.');}
 if(action==='workspace.create'){const v=z.object({name:named}).parse(data);const ws=uid(),mid=uid();await database().batch([database().prepare('INSERT INTO workspaces(id,name,owner_id,created_at) VALUES(?,?,?,?)').bind(ws,v.name,ctx.me.userId,now()),database().prepare('INSERT INTO members(id,workspace_id,user_id,email,name,role,color) VALUES(?,?,?,?,?,?,?)').bind(mid,ws,ctx.me.userId,ctx.me.email,ctx.me.name,'admin',ctx.me.color)]);return {workspaceId:ws}}
 if(action==='workspace.rename'){requireWorkspaceAdmin(ctx);const v=z.object({name:named}).parse(data);await write('UPDATE workspaces SET name=? WHERE id=?',v.name,ctx.workspace.id);return {}}
 if(action==='member.invite'){requireWorkspaceAdmin(ctx);const v=z.object({name:named,email:z.string().trim().email().max(200),role:z.enum(['admin','developer','qa'])}).parse(data);const mid=uid();try{await write('INSERT INTO members(id,workspace_id,email,name,role,color) VALUES(?,?,?,?,?,?)',mid,ctx.workspace.id,v.email.toLowerCase(),v.name,v.role,'#668ca8')}catch{throw new AppError(409,'This email is already in the workspace.')}return {id:mid}}
 if(action==='member.update')return executeQualityAction(ctx,{action:'user.role',id,data},'');
 if(action==='member.remove')return executeQualityAction(ctx,{action:'user.remove',id},'');
 if(action==='project.create'){const p=projectInput.parse(data);await validateWorkspaceMembers(ctx,p.memberIds);if(p.teamId)await document(ctx.workspace.id,'team',p.teamId);const pid=await insert(ctx.workspace.id,'project',{...p,memberIds:[...new Set([ctx.me.id,...p.memberIds])]});await recordActivity(ctx,undefined,'created this project',pid);return {id:pid}}
 if(action==='project.update'){const p=await getAccessibleProject(ctx,identifier.parse(id));const next=projectInput.parse({...p,...z.record(z.unknown()).parse(data)});await validateWorkspaceMembers(ctx,next.memberIds);if(next.teamId)await document(ctx.workspace.id,'team',next.teamId);const tasks=await documents<Task>(ctx.workspace.id,'task');for(const t of tasks.filter(t=>t.projectId===id&&!t.deleted))if(t.sectionId&&!next.sections.some(s=>s.id===t.sectionId))throw new AppError(400,'Move tasks out of a section before removing it.');await replace(ctx.workspace.id,'project',id!,{...next,id});return {id}}
 if(action==='task.create')return {id:await createTask(ctx,data)};
 if(action==='task.update'){const old=await getAccessibleTask(ctx,identifier.parse(id));if(version===undefined)throw new AppError(400,'A task version is required.');const patch=taskPatch.strict().parse(data);let task={...old,...patch,projectIds:[...new Set([patch.projectId??old.projectId,...(patch.projectIds??old.projectIds)].filter(Boolean))]};if(patch.projectId!==undefined&&patch.projectId!==old.projectId&&!patch.sectionId){task.sectionId=patch.projectId?(await getAccessibleProject(ctx,patch.projectId)).sections[0].id:''}await validateTask(ctx,task);const completed=task.completed&&!old.completed;task.completedAt=task.completed?(old.completedAt||now()):'';if(completed)task=await applyProjectRules(ctx,task,'completed');else if(task.sectionId!==old.sectionId)task=await applyProjectRules(ctx,task,'moved');await replace(ctx.workspace.id,'task',id!,task,version);const description=patch.deleted===true?'moved this task to trash':patch.deleted===false?'restored this task':completed?'completed this task':!task.completed&&old.completed?'reopened this task':'updated this task';await recordActivity(ctx,task,description);if(completed&&task.recurrence){const newTask={...task,id:uid(),name:task.name,completed:false,completedAt:'',createdAt:now(),startDate:nextOccurrenceDate(task.startDate,task.recurrence),dueDate:nextOccurrenceDate(task.dueDate,task.recurrence),version:1};await insert(ctx.workspace.id,'task',newTask)}return {id}}
 if(action==='task.duplicate'){const task=await getAccessibleTask(ctx,identifier.parse(id));return {id:await createTask(ctx,{...task,name:`${task.name} (copy)`,completed:false,dependencies:[],recurrence:''})}}
 if(action==='comment.create'){const v=z.object({taskId:identifier,body:z.string().trim().min(1,'Write a comment first.').max(20000)}).parse(data);const task=await getAccessibleTask(ctx,v.taskId);const cid=await insert(ctx.workspace.id,'comment',{...v,memberId:ctx.me.id,createdAt:now()});await recordActivity(ctx,task,'commented on this task');return {id:cid}}
 if(action==='comment.update'){const c=await document<Comment>(ctx.workspace.id,'comment',identifier.parse(id));await getAccessibleTask(ctx,c.taskId);if(c.memberId!==ctx.me.id)throw new AppError(403,'You can only edit your own comments.');const v=z.object({body:z.string().trim().min(1).max(20000)}).parse(data);await replace(ctx.workspace.id,'comment',id!,{...c,...v,editedAt:now()});return {id}}
 if(action==='comment.delete'){const c=await document<Comment>(ctx.workspace.id,'comment',identifier.parse(id));await getAccessibleTask(ctx,c.taskId);if(c.memberId!==ctx.me.id&&ctx.me.role!=='admin')throw new AppError(403,'You cannot delete this comment.');await write('DELETE FROM records WHERE id=? AND workspace_id=? AND kind=?',id,ctx.workspace.id,'comment');return {id}}
 if(action==='entity.save'){
  const kind=entityKind.parse(envelope.kind);
  const entity=entitySchemas[kind].parse(data);
  if(kind==='team')requireWorkspaceAdmin(ctx);
  if(id){
   const {projectId}=projectReference.parse(await document(ctx.workspace.id,kind,id));
   if(projectId)await getAccessibleProject(ctx,projectId);
  }
  if('projectId' in entity)await getAccessibleProject(ctx,entity.projectId);
  if('projectIds' in entity){
   for(const projectId of entity.projectIds)await getAccessibleProject(ctx,projectId);
  }
  if('memberIds' in entity)await validateWorkspaceMembers(ctx,entity.memberIds);
  if('ownerId' in entity)await validateWorkspaceMembers(ctx,[entity.ownerId]);
  if('trigger' in entity){
   if(entity.action==='set_priority')z.enum(['none','low','medium','high','urgent']).parse(entity.value);
   if(entity.action==='set_status')z.enum(['on_track','at_risk','off_track','on_hold']).parse(entity.value);
   if(entity.action==='assign')await validateWorkspaceMembers(ctx,[entity.value]);
   if(entity.action==='move'&&!(await getAccessibleProject(ctx,entity.projectId)).sections.some(section=>section.id===entity.value)){
    throw new AppError(400,'Select a valid section.');
   }
  }
  const record={...entity,...(kind==='document'?{updatedAt:now(),memberId:ctx.me.id}:{})};
  if(!id)return {id:await insert(ctx.workspace.id,kind,record)};
  await replace(ctx.workspace.id,kind,id,{...record,id});
  return {id};
 }
 if(action==='entity.delete'){
  const kind=entityKind.parse(envelope.kind);
  if(kind==='team')requireWorkspaceAdmin(ctx);
  const recordId=identifier.parse(id);
  const {projectId}=projectReference.parse(await document(ctx.workspace.id,kind,recordId));
  if(projectId)await getAccessibleProject(ctx,projectId);
  await write('DELETE FROM records WHERE workspace_id=? AND kind=? AND id=?',ctx.workspace.id,kind,recordId);
  return {id:recordId};
 }
 if(action==='form.submit'){const v=z.object({formId:identifier,answers:z.array(z.string().max(10000)).max(20)}).parse(data);const f=await document<{projectId:string;name:string;fields:{label:string;required:boolean;type:string}[]}>(ctx.workspace.id,'form',v.formId);const p=await getAccessibleProject(ctx,f.projectId);for(let i=0;i<f.fields.length;i++)if(f.fields[i].required&&!v.answers[i]?.trim())throw new AppError(400,`${f.fields[i].label} is required.`);const title=v.answers[0]?.trim()||f.name;return {id:await createTask(ctx,{name:title.slice(0,180),description:f.fields.map((field,i)=>`${field.label}\n${v.answers[i]||'—'}`).join('\n\n'),projectId:p.id,sectionId:p.sections[0].id})}}
 throw new AppError(400,'This action is not supported.');
}
