'use client';
import React,{useEffect,useState,useRef} from 'react';
import {ArrowUp,ArrowDown} from '@phosphor-icons/react';
import type {QACase,QAReport} from '../../lib/server/qa';
import {formatEnumLabel,type QualityWorkspace,type SubmitQualityAction,type QualityActionResult} from './quality-parts';
import {caseCsvTemplate,maxCaseCsvBytes,maxCaseCsvRows} from '../../lib/qa-csv';
import {legacyWidgets,maxDashboardWidgets,widgetSchema,type ChartWidget,type DashboardWidget} from '../../lib/qa-dashboard';
import {WidgetEditor} from './qa-widget-editor';
export type QualityDialog =
 | {type:'report';data?:QAReport}
 | {type:'case';data:QACase | {reportId:string;id?:never;version?:never;kind?:never;severity?:never;assigneeId?:never}}
 | {type:'case.import';data:{reportId:string;title:string}}
 | {type:'case.respond'|'case.execution'|'case.delete';data:QACase}
 | {type:'case.transition';data:QACase & {next:'in_progress'|'closed'|'reopened'}}
 | {type:'dashboard'|'user.invite';data?:never}
 | {type:'widget';data:{reportId:string;widget?:never;legacy?:never} | {widget:ChartWidget;legacy?:string;reportId?:never}}
 | {type:'user.disable'|'user.enable'|'user.remove';data:{id:string;name:string}}
 | {type:'link';data:{link:string}};

type QualityEditorProps = {
 modal:QualityDialog;
 state:QualityWorkspace;
 act:SubmitQualityAction;
 busy:boolean;
 close:()=>void;
 setModal:(modal:QualityDialog)=>void;
 openReport:(id:string)=>void;
 openCase:(target:Pick<QACase,'id'|'reportId'>)=>void;
 onImported:(count:number)=>void;
 requestError:string;
};

export default function QualityEditor({modal,state,act,busy,close,setModal,openReport,openCase,onImported,requestError}:QualityEditorProps){
 const {type,data}=modal;
 const existingWidget = type==='widget' ? data.widget : undefined;
 const widgetReportId = type==='widget' ? data.reportId : undefined;
 const [widgets,setWidgets]=useState<DashboardWidget[]>(state.dashboard.widgets);
 const [widget,setWidget]=useState<ChartWidget>(()=>existingWidget||{
  id:'',title:'',type:'bar',group:'status',series:'kind',metric:'count',labels:true,
  filters:widgetReportId?{reportId:widgetReportId}:{},
 });
 const [dashboardVersion]=useState(state.dashboard.version);
 const [localError,setLocalError]=useState('');
 const ref=useRef<HTMLDivElement>(null);
 const importId=useRef('');
 const [readingFile,setReadingFile]=useState(false);
 const developers=state.members.filter(m=>['developer','admin'].includes(m.role)&&!m.disabled);
 useEffect(()=>{const prior=document.activeElement;const container=ref.current;container?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')close();if(e.key==='Tab'&&container){const nodes=Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);if(prior instanceof HTMLElement)prior.focus()}},[close]);
 const fieldValue = (name:string) => {
  const value:unknown = Object.entries(data ?? {}).find(([key]) => key === name)?.[1];
  return typeof value === 'string' ? value : '';
 };
 const input=(label:string,name:string,opts:{required?:boolean;value?:string;area?:boolean;type?:string}={})=><label>{label}{opts.area?<textarea name={name} rows={4} required={opts.required} maxLength={20000} defaultValue={opts.value??fieldValue(name)}/>:<input name={name} type={opts.type||'text'} required={opts.required} maxLength={name==='resource'?2000:500} defaultValue={opts.value??fieldValue(name)}/>}</label>;
 const titles:Record<QualityDialog['type'],string>={report:type==='report'&&data?.id?'Edit report':'Create QA report',case:type==='case'&&data.id?'Edit case':'Add bug or test case','case.import':'Import cases from CSV','case.respond':'Developer fix response','case.transition':type==='case.transition'&&data.next==='closed'?'QA verification and closure':type==='case.transition'&&data.next==='reopened'?'Reopen case':'Start development','case.execution':'Record test execution','case.delete':type==='case.delete'&&data.deleted?'Restore case':'Move case to trash',dashboard:'Manage dashboard',widget:existingWidget?'Edit widget':'Add widget','user.invite':'Invite user','user.disable':'Disable user','user.enable':'Enable user','user.remove':'Remove workspace member',link:'Share this single-use link'};
 return <div className="qa-modal-backdrop"><div className="qa-modal" role="dialog" aria-modal="true" aria-labelledby="qa-modal-title" ref={ref}><header><h2 id="qa-modal-title">{titles[type]}</h2><button aria-label="Close dialog" onClick={close} disabled={busy}>×</button></header>{type==='link'?<div className="qa-modal-body"><p>Share this link privately with the intended user. Relay does not send emails. Reset links expire in 1 hour; invitations expire in 48 hours.</p><label>Account link<input readOnly value={data.link} onFocus={e=>e.target.select()}/></label><button className="qa-primary" onClick={async()=>{try{await navigator.clipboard.writeText(data.link);setLocalError('Copied.')}catch{setLocalError('Select and copy the link above.')}}}>Copy link</button>{localError&&<p>{localError}</p>}</div>:<form onSubmit={async e=>{e.preventDefault();setLocalError('');const values=Object.fromEntries(new FormData(e.currentTarget));let result:QualityActionResult|null=null;
 if(type==='report')result=await act('report.save',{title:values.title,description:values.description,build:values.build,environment:values.environment,projectId:values.projectId||''},data?.id,data?.version);
 else if(type==='case')result=await act('case.save',{reportId:values.reportId,kind:values.kind,title:values.title,steps:values.steps,expected:values.expected,actual:values.actual,severity:values.severity,assigneeId:values.assigneeId},data.id,data.version);
 else if(type==='case.import'){
  const file=values.csv;
  if(!(file instanceof File)||!file.size||file.size>maxCaseCsvBytes){setLocalError('Choose a CSV file up to 90 KB.');return}
  setReadingFile(true);
  try {
   const csv=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
   importId.current ||= crypto.randomUUID();
   result=await act(type,{reportId:data.reportId,assigneeId:values.assigneeId,csv,importId:importId.current});
   if(result?.count!==undefined){onImported(result.count);close()}
  } catch {setLocalError('Save the file as UTF-8 CSV and try again.')}
  finally {setReadingFile(false)}
  return;
 }
 else if(type==='case.respond')result=await act(type,{fixed:values.fixed==='yes',note:values.note,resource:values.resource},data.id,data.version);
 else if(type==='case.transition')result=await act(type,{status:data.next,note:values.note},data.id,data.version);
 else if(type==='case.execution')result=await act(type,{result:values.result,note:values.note},data.id,data.version);
 else if(type==='case.delete')result=await act(type,{deleted:!data.deleted,note:values.note},data.id,data.version);
 else if(type==='dashboard')result=await act('dashboard.save',{title:values.title,widgets},undefined,dashboardVersion||undefined);
 else if(type==='widget'){
  const parsed=widgetSchema.safeParse({...widget,id:!widget.id||data.legacy?crypto.randomUUID():widget.id});
  if(!parsed.success){setLocalError(parsed.error.issues[0].message);return}
  const next=data.widget?widgets.map(item=>(typeof item==='string'?item===data.legacy:item.id===widget.id)?parsed.data:item):[...widgets,parsed.data];
  result=await act('dashboard.save',{title:state.dashboard.title,widgets:next},undefined,dashboardVersion||undefined);
 }
 else if(type==='user.invite'){result=await act(type,{name:values.name,email:values.email,role:values.role});if(result?.link){setModal({type:'link',data:{link:result.link}});return}if(result?.existing){setModal({type:'link',data:{link:`${location.origin}/login`}});return}}
 else if(type==='user.disable'||type==='user.enable'||type==='user.remove')result=await act(type,undefined,data.id);
 if(result){close();if(type==='report'&&result.id)openReport(result.id);if(type==='case'&&!data.id&&result.id&&typeof values.reportId==='string')openCase({id:result.id,reportId:values.reportId})}
 else if(type!=='widget'&&type!=='dashboard')setLocalError('Not saved. Check the workspace error message and try again.');
 }}><div className="qa-modal-body">{type==='report'&&<>{input('Report title','title',{required:true})}{input('Description / test scope','description',{area:true})}<label>Related project<select name="projectId" defaultValue={data?.projectId||''}><option value="">No linked project</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="qa-form-row">{input('Build / version','build')}{input('Environment','environment')}</div></>}
 {type==='case'&&<><label>Report<select name="reportId" required defaultValue={data.reportId||''}>{state.reports.filter(r=>!r.archived&&(!data.id||r.id===data.reportId)).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><div className="qa-form-row"><label>Case type<select name="kind" defaultValue={data.kind||'bug'}><option value="bug">Bug</option><option value="test_case">Test case</option></select></label><label>Severity<select name="severity" defaultValue={data.severity||'medium'}>{['critical','high','medium','low'].map(s=><option key={s}>{s}</option>)}</select></label></div>{input('Case title','title',{required:true})}<label>Assigned developer<select required name="assigneeId" defaultValue={data.assigneeId||''}><option value="">Choose a developer</option>{state.members.filter(m=>['developer','admin'].includes(m.role)&&!m.disabled).map(m=><option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}</select></label>{input('Steps to reproduce / execute','steps',{required:true,area:true})}{input('Expected result','expected',{required:true,area:true})}{input('Actual result','actual',{area:true})}</>}
 {type==='case.respond'&&<><p>Marking a bug fixed sends it to QA for verification. It does not close the case.</p><label>Fix outcome<select name="fixed"><option value="yes">Fixed — ready for QA</option><option value="no">Not fixed</option></select></label>{input('Response / explanation','note',{required:true,area:true,value:''})}{input('Supporting link (optional)','resource',{type:'url',value:''})}<small>Upload screenshots, logs, patches, or other files in the case’s evidence section.</small></>}
 {type==='case.import'&&<>
  <p>Add up to {maxCaseCsvRows} new bugs and test cases to <strong>{data.title}</strong>. Include Type, Title, Steps, and Expected. Use <code>bug</code> or <code>test_case</code> for Type.</p>
  <p><a download="relay-case-import-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(caseCsvTemplate)}`}>Download CSV template</a></p>
  <label>CSV file<input name="csv" type="file" accept=".csv,text/csv" required disabled={busy||readingFile} onChange={()=>{importId.current='';setLocalError('')}}/></label>
  <label>Default developer<select name="assigneeId" required disabled={busy||readingFile} onChange={()=>{importId.current=''}}>
   <option value="">Choose a developer</option>
   {developers.map(m=><option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
  </select></label>
  <p>Rows can specify a developer by workspace email or unique name. Blank severity uses Medium.</p>
 </>}
 {type==='case.transition'&&<>{data.next==='closed'&&<p>Confirm that you have retested the case and the expected result is met.</p>}{input(data.next==='closed'?'QA verification notes':'Reason / notes','note',{required:true,area:true,value:''})}</>}
 {type==='case.execution'&&<><label>Test result<select name="result" defaultValue={data.result}>{['not_run','passed','failed','blocked'].map(s=><option value={s} key={s}>{formatEnumLabel(s)}</option>)}</select></label>{input('Execution notes','note',{required:true,area:true,value:''})}</>}
 {type==='case.delete'&&<>{input('Reason','note',{required:true,area:true,value:''})}<p>Case history is retained. Trashed cases can be restored.</p></>}
 {type==='dashboard'&&<>
  {input('Dashboard title','title',{required:true,value:state.dashboard.title})}
  <p>Choose and arrange widgets for the shared workspace dashboard.</p>
  {Object.entries(legacyWidgets).map(([value,label])=>{
   const preset=value as keyof typeof legacyWidgets;
   return <label className="qa-check" key={preset}><input type="checkbox" checked={widgets.includes(preset)}
    disabled={!widgets.includes(preset)&&widgets.length>=maxDashboardWidgets}
    onChange={event=>setWidgets(event.currentTarget.checked?[...widgets,preset]:widgets.filter(item=>item!==preset))}/>{label}</label>;
  })}
  <div className="qa-widget-order">{widgets.map((item,index)=>{
   const label=typeof item==='string'?legacyWidgets[item]:item.title;
   function move(offset:number){
    setWidgets(current=>{const next=[...current];const [entry]=next.splice(index,1);next.splice(index+offset,0,entry);return next});
   }
   return <div key={typeof item==='string'?item:item.id}><span>{label}</span>
    <button type="button" aria-label={`Move ${label} up`} disabled={index===0} onClick={()=>move(-1)}><ArrowUp/></button>
    <button type="button" aria-label={`Move ${label} down`} disabled={index===widgets.length-1} onClick={()=>move(1)}><ArrowDown/></button>
    {typeof item!=='string'&&<button type="button" aria-label={`Remove ${label}`}
     onClick={()=>setWidgets(current=>current.filter(entry=>entry!==item))}>Remove</button>}
   </div>;
  })}</div>
 </>}
 {type==='widget'&&<WidgetEditor widget={widget} change={setWidget} state={state}
  cases={state.cases.filter(c=>!c.deleted&&(!state.reports.find(r=>r.id===c.reportId)?.archived||widget.filters.reportId===c.reportId))}/>}
 {type==='user.invite'&&<>{input('Full name','name',{required:true})}{input('Email address','email',{required:true,type:'email'})}<label>Role<select name="role"><option value="developer">Developer</option><option value="qa">QA</option><option value="admin">Admin</option></select></label><p>You will receive a single-use invitation link to share with this user.</p></>}
 {(type==='user.disable'||type==='user.enable'||type==='user.remove')&&<p>{type==='user.remove'?`Remove ${data.name} from this workspace? Reports, responses, and history will be retained.`:type==='user.disable'?`Disable ${data.name} and sign out their sessions?`:`Enable ${data.name} to sign in again?`}</p>}
 {(localError||(type==='case.import'||type==='widget'||type==='dashboard')&&requestError)&&<p className="qa-error" role="alert">{localError||requestError}</p>}</div><footer><button type="button" disabled={busy||readingFile} onClick={close}>Cancel</button><button className="qa-primary" disabled={busy||readingFile||type==='case.import'&&!developers.length}>{type==='case.import'?(busy||readingFile?'Importing…':'Import cases'):busy?'Saving…':type==='user.invite'?'Create invitation':type==='case.respond'?'Submit response':type==='widget'&&!existingWidget?'Add widget':'Save'}</button></footer></form>}</div></div>
}
