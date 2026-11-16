import {env} from '@/lib/server/runtime';
import type {ChatGPTUser} from '../../app/chatgpt-auth';
import type {AppState,Kind,Member,Project,Task} from '../model';
import {canSeeProject,colors} from '../model';
import {seedWorkspace} from './seed';
import {postgresDatabase} from './postgres';

export class AppError extends Error{constructor(public status:number,message:string){super(message)}}
export function postgresConnection() {
 const bindings = env as typeof env & {POSTGRES_URL?: string; HYPERDRIVE?: {connectionString: string}};
 return bindings.HYPERDRIVE?.connectionString || bindings.POSTGRES_URL;
}
export function database() {
 const connection = postgresConnection();
 if(connection) return postgresDatabase(connection);
 if(!env.DB) throw new AppError(503,'The workspace database is not available.');
 return env.DB as unknown as ReturnType<typeof postgresDatabase>;
}
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export async function rows<T>(sql:string,...args:unknown[]){return (await database().prepare(sql).bind(...args).all()).results as T[]}
export async function one<T>(sql:string,...args:unknown[]){return await database().prepare(sql).bind(...args).first<T>()}
export async function write(sql:string,...args:unknown[]){return database().prepare(sql).bind(...args).run()}
export async function stableId(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function identityWorkspace(user:ChatGPTUser,requested?:string){
  // Accept only invitations addressed to the authenticated, hosting-verified email.
  await write('UPDATE members SET user_id = ? WHERE user_id IS NULL AND lower(email) = lower(?)',user.userId,user.email);
  let available=await rows<{id:string;name:string;ownerId:string}>('SELECT w.id,w.name,w.owner_id as "ownerId" FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.created_at',user.userId);
  if(!available.length){const hash=await stableId(user.userId);await seedWorkspace(user,`ws_${hash}`,`member_${hash}`);available=await rows('SELECT w.id,w.name,w.owner_id as "ownerId" FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.created_at',user.userId)}
  const workspace=requested?available.find(w=>w.id===requested):available[0];
  if(!workspace)throw new AppError(403,'You do not have access to this workspace.');
  const me=await one<Member>('SELECT id,workspace_id as "workspaceId",user_id as "userId",email,name,role,color FROM members WHERE workspace_id=? AND user_id=?',workspace.id,user.userId);
  if(!me)throw new AppError(403,'Workspace membership is required.');
  return {workspace,me,available};
}
export type Context=Awaited<ReturnType<typeof identityWorkspace>>;
export type Stored={id:string;kind:Kind;data:string;version:number};
export async function document<T>(workspaceId:string,kind:Kind,id:string){const r=await one<Stored>('SELECT id,kind,data,version FROM records WHERE workspace_id=? AND kind=? AND id=?',workspaceId,kind,id);if(!r)throw new AppError(404,'This item is no longer available.');return {...JSON.parse(r.data),id:r.id,version:r.version} as T}
export async function documents<T>(workspaceId:string,kind:Kind){const r=await rows<Stored>('SELECT id,data,version FROM records WHERE workspace_id=? AND kind=?',workspaceId,kind);return r.map(r=>({...JSON.parse(r.data),id:r.id,version:r.version})) as T[]}
export async function insert(workspaceId:string,kind:Kind,data:Record<string,unknown>){const id=(data.id as string)||uid();await write('INSERT INTO records(id,workspace_id,kind,data,version,updated_at) VALUES(?,?,?,?,1,?)',id,workspaceId,kind,JSON.stringify({...data,id}),now());return id}
export async function replace(workspaceId:string,kind:Kind,id:string,data:unknown,version?:number){
 const sql=version===undefined?'UPDATE records SET data=?,version=version+1,updated_at=? WHERE workspace_id=? AND kind=? AND id=?':'UPDATE records SET data=?,version=version+1,updated_at=? WHERE workspace_id=? AND kind=? AND id=? AND version=?';
 const args=[JSON.stringify(data),now(),workspaceId,kind,id,...(version===undefined?[]:[version])];
 const result=await write(sql,...args);if(!result.meta.changes)throw new AppError(409,'This item changed in another session. Refresh and try again.');
}
export function editable(ctx:Context){if(!['admin','developer','qa'].includes(ctx.me.role))throw new AppError(403,'Your workspace role cannot edit work.')}
export function admin(ctx:Context){if(ctx.me.role!=='admin')throw new AppError(403,'Only workspace admins can do that.')}
export async function projectAccess(ctx:Context,id:string){const project=await document<Project>(ctx.workspace.id,'project',id);if(!canSeeProject(project,ctx.me))throw new AppError(403,'This project is private.');return project}
export async function taskAccess(ctx:Context,id:string){const task=await document<Task>(ctx.workspace.id,'task',id);if(task.projectId){await projectAccess(ctx,task.projectId)}else if(task.createdBy!==ctx.me.id&&task.assigneeId!==ctx.me.id&&!task.collaboratorIds.includes(ctx.me.id))throw new AppError(403,'This task is private.');return task}
export async function state(ctx:Context):Promise<AppState>{
 const all=await rows<Stored>('SELECT id,kind,data,version FROM records WHERE workspace_id=?',ctx.workspace.id);
 const by=(kind:Kind)=>all.filter(r=>r.kind===kind).map(r=>({...JSON.parse(r.data),id:r.id,version:r.version}));
 const projects=by('project').filter((p:Project)=>canSeeProject(p,ctx.me));const projectIds=new Set(projects.map(p=>p.id));
 const tasks=by('task').filter((t:Task)=>t.projectId?projectIds.has(t.projectId):t.createdBy===ctx.me.id||t.assigneeId===ctx.me.id||t.collaboratorIds.includes(ctx.me.id));const taskIds=new Set(tasks.map(t=>t.id));
 const members=await rows<Member>('SELECT id,workspace_id as "workspaceId",user_id as "userId",email,name,role,color FROM members WHERE workspace_id=? ORDER BY name,id',ctx.workspace.id);
 return {workspace:ctx.workspace,workspaces:ctx.available,me:ctx.me,members,projects,tasks,comments:by('comment').filter(c=>taskIds.has(c.taskId)),attachments:by('attachment').filter(a=>taskIds.has(a.taskId)),events:by('event').filter(e=>(!e.taskId||taskIds.has(e.taskId))&&(!e.projectId||projectIds.has(e.projectId))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,300),notifications:by('notification').filter(n=>n.memberId===ctx.me.id&&(!n.taskId||taskIds.has(n.taskId))),teams:by('team'),portfolios:by('portfolio').map(p=>({...p,projectIds:p.projectIds.filter((id:string)=>projectIds.has(id))})),goals:by('goal').map(g=>({...g,projectIds:g.projectIds.filter((id:string)=>projectIds.has(id))})),rules:by('rule').filter(r=>projectIds.has(r.projectId)),forms:by('form').filter(f=>projectIds.has(f.projectId)),documents:by('document').filter(d=>projectIds.has(d.projectId)),preferences:by('preference').filter(p=>p.memberId===ctx.me.id)};
}
export async function recordActivity(ctx:Context,task:Task|undefined,body:string,projectId=''){
 await insert(ctx.workspace.id,'event',{taskId:task?.id||'',projectId:task?.projectId||projectId,memberId:ctx.me.id,body,createdAt:now()});
 if(task){const recipients=new Set([task.assigneeId,...task.collaboratorIds].filter(id=>id&&id!==ctx.me.id));for(const memberId of recipients)await insert(ctx.workspace.id,'notification',{memberId,taskId:task.id,title:task.name,body:`${ctx.me.name} ${body}`,read:false,archived:false,bookmarked:false,createdAt:now()})}
}
