// Runs only against the built LOCAL Worker, simulating trusted dispatch identity headers.
// No test-only authentication route or bypass is included in the deployed application.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin='http://127.0.0.1:5174',stamp=Date.now();
const identity=(name)=>({'oai-authenticated-user-id':`qa_${name}_${stamp}`,'oai-authenticated-user-email':`${name}.${stamp}@relay.test`,'oai-authenticated-user-full-name':`QA ${name}`,'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'});
const admin=identity('admin'),editor=identity('editor'),viewer=identity('viewer'),outsider=identity('outsider');
const results=[];let workspace='';
const get=async(headers,expected=200)=>{const r=await fetch(`${origin}/api/relay${workspace?`?workspace=${workspace}`:''}`,{headers});const b=await r.json();assert.equal(r.status,expected,JSON.stringify(b));return b};
const post=async(headers,action,data,id,version,expected=200)=>{const r=await fetch(`${origin}/api/relay?workspace=${workspace}`,{method:'POST',headers:{...headers,'Content-Type':'application/json',Origin:origin},body:JSON.stringify({action,...(data===undefined?{}:{data}),...(id?{id}:{}),...(version?{version}:{})})});const b=await r.json();assert.equal(r.status,expected,JSON.stringify(b));return b};
const run=async(name,fn)=>{try{await fn();results.push({name,status:'passed'});console.log('PASS '+name)}catch(e){results.push({name,status:'failed',error:e.message});throw e}};
try{
 await run('production routes reject absent identity',async()=>{await get({},401)});
 let s=await get(admin);workspace=s.workspace.id;
 await post(admin,'member.invite',{name:'QA editor',email:editor['oai-authenticated-user-email'],role:'editor'});
 await post(admin,'member.invite',{name:'QA viewer',email:viewer['oai-authenticated-user-email'],role:'viewer'});
 let es,vs;
 await run('invitations bind only to the matching authenticated email',async()=>{es=await get(editor);vs=await get(viewer);assert.equal(es.me.role,'editor');assert.equal(vs.me.role,'viewer');assert.equal(es.workspace.id,workspace)});
 await run('outsiders cannot select another workspace',async()=>{await get(outsider,403)});
 await run('viewers cannot create or edit work',async()=>{await post(viewer,'task.create',{name:'not allowed'},undefined,undefined,403);const task=vs.tasks[0];await post(viewer,'task.update',{completed:true},task.id,task.version,403)});
 await run('editors cannot grant memberships or rename workspaces',async()=>{await post(editor,'member.invite',{name:'Escalation',email:'blocked@relay.test',role:'admin'},undefined,undefined,403);await post(editor,'workspace.rename',{name:'Unauthorized rename'},undefined,undefined,403)});
 await run('workspace owner cannot lose admin access',async()=>{await post(admin,'member.update',{role:'viewer'},s.me.id,undefined,400);await post(admin,'member.remove',undefined,s.me.id,undefined,400)});
 const privateProject=await post(admin,'project.create',{name:'Private QA work',privacy:'private',sections:[{id:'todo',name:'To do'}],memberIds:[s.me.id]});
 const privateTask=await post(admin,'task.create',{name:'Private QA task',projectId:privateProject.id,sectionId:'todo'});
 await run('private projects and tasks are filtered from other members',async()=>{const state=await get(editor);assert.ok(!state.projects.some(p=>p.id===privateProject.id));assert.ok(!state.tasks.some(t=>t.id===privateTask.id))});
 await run('known private task IDs do not bypass permissions',async()=>{await post(editor,'task.update',{name:'Forbidden'},privateTask.id,1,403);await post(editor,'comment.create',{taskId:privateTask.id,body:'Forbidden'},undefined,undefined,403)});
 await run('members can edit accessible work with a current version',async()=>{const task=(await get(editor)).tasks.find(t=>t.projectId);await post(editor,'task.update',{description:'Authorized update'},task.id,task.version);assert.equal((await get(editor)).tasks.find(t=>t.id===task.id).description,'Authorized update')});
 await run('foreign workspace member IDs are rejected',async()=>{const task=(await get(admin)).tasks.find(t=>t.id===privateTask.id);await post(admin,'task.update',{assigneeId:'not-a-member'},task.id,task.version,400)});
 await run('multi-level subtask cycles are rejected',async()=>{const a=await post(admin,'task.create',{name:'Cycle A',projectId:privateProject.id,sectionId:'todo'});const b=await post(admin,'task.create',{name:'Cycle B',parentId:a.id,projectId:privateProject.id,sectionId:'todo'});const c=await post(admin,'task.create',{name:'Cycle C',parentId:b.id,projectId:privateProject.id,sectionId:'todo'});await post(admin,'task.update',{parentId:c.id},a.id,1,400)});
 await run('private file uploads cannot be attached by other members',async()=>{const form=new FormData();form.append('taskId',privateTask.id);form.append('file',new Blob(['QA private data'],{type:'text/plain'}),'private.txt');const r=await fetch(`${origin}/api/files?workspace=${workspace}`,{method:'POST',headers:{...editor,Origin:origin},body:form});assert.equal(r.status,403)});
 await run('notification updates are limited to the recipient',async()=>{const n=(await get(admin)).notifications[0];assert.ok(n);await post(editor,'notification.update',{read:true},n.id,undefined,403)});
}finally{fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/permission-results.json',JSON.stringify({identity:'Local simulation of trusted Sites dispatch headers',results},null,2));}
