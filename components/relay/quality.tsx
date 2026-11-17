'use client';
import RelayLogo from './relay-logo';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Bug,ChartBar,FileText,Users,Gear,SignOut,Plus,ArrowLeft,ArrowUpRight,Bell,Folder,List} from '@phosphor-icons/react';
import {apiErrorSchema} from '../../lib/validation';
import type {QACase} from '../../lib/server/qa';
import {maxDashboardWidgets,type ChartWidget} from '../../lib/qa-dashboard';
import Dashboard from './qa-dashboard';
import QualityEditor,{type QualityDialog} from './quality-editor';
import {FilePanel,Discussion,History,AccountSettings,downloadCasesCsv,Status,Empty,statusLabel,formatEnumLabel,formatTimestamp,qualityActionResponseSchema,type QualityWorkspace,type SubmitQualityAction} from './quality-parts';
import './quality.css';

export default function QualityApp(){
 const router=useRouter();
 const[state,setState]=useState<QualityWorkspace|null>(null),[workspace,setWorkspace]=useState(''),[page,setPage]=useState('dashboard'),[reportId,setReportId]=useState(''),[caseId,setCaseId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[modal,setModal]=useState<QualityDialog|null>(null),[mobile,setMobile]=useState(false),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[severity,setSeverity]=useState('all'),[developer,setDeveloper]=useState('all'),[archived,setArchived]=useState(false),[trash,setTrash]=useState(false);
 const [analyticsReport,setAnalyticsReport]=useState(''),[reportDashboard,setReportDashboard]=useState('');
 const initialized=useRef(false);
 const requestSequence=useRef(0);
 const refresh=useCallback((signal?:AbortSignal)=>{
  const requestId=++requestSequence.current;
  const url=workspace?`/api/qa?workspace=${encodeURIComponent(workspace)}`:'/api/qa';
  return fetch(url,{cache:'no-store',signal}).then(async response=>{
   if(signal?.aborted||requestId!==requestSequence.current)return;
   if(response.status===401){router.replace('/login');return}
   if(!response.ok){
    const failure=apiErrorSchema.safeParse(await response.json());
    throw new Error(failure.success?failure.data.error:'Could not open the quality workspace.');
   }
   const snapshot:QualityWorkspace=await response.json();
   if(signal?.aborted||requestId!==requestSequence.current)return;
   setState(snapshot);
   if(initialized.current)return;
   initialized.current=true;

   const params=new URLSearchParams(location.search);
   const selectedCase=snapshot.cases.find(item=>item.id===params.get('case'));
   if(selectedCase){
    setCaseId(selectedCase.id);
    setReportId(selectedCase.reportId);
    setPage('reports');
    return;
   }
   const selectedReport=snapshot.reports.find(item=>item.id===params.get('report'));
   if(selectedReport){
    setReportId(selectedReport.id);
    setPage('reports');
   }
  }).catch(error=>{
   if(!signal?.aborted&&requestId===requestSequence.current)throw error;
  });
 },[router,workspace]);
 useEffect(()=>{
  document.documentElement.dataset.theme='light';
  const controller=new AbortController();
  void refresh(controller.signal).catch(error=>setError(error.message));
  const timer=setInterval(()=>{
   if(document.visibilityState==='visible')void refresh(controller.signal).catch(()=>{});
  },20000);
  return ()=>{
   clearInterval(timer);
   controller.abort();
  };
 },[refresh]);
 const submitQualityAction:SubmitQualityAction=async(action,data,id,version)=>{setBusy(true);setError('');try{const r=await fetch(`/api/qa?workspace=${state?.workspace.id||workspace}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(data!==undefined?{data}:{}),...(id?{id}:{}),...(version?{version}:{})})});const body:unknown=await r.json();if(!r.ok){const failure=apiErrorSchema.safeParse(body);throw Error(failure.success?failure.data.error:'Could not save the change.')}const result=qualityActionResponseSchema.parse(body);await refresh();return result}catch(e){setError((e as Error).message);await refresh().catch(()=>{});return null}finally{setBusy(false)}};
 const closeEditor=useCallback(()=>setModal(null),[]);
 const openReport=(id:string)=>{setReportId(id);setCaseId('');setPage('reports');history.replaceState(null,'',`/qa?report=${id}`)};
 const openCase=(c:Pick<QACase,'id'|'reportId'>)=>{setCaseId(c.id);setReportId(c.reportId);setPage('reports');history.replaceState(null,'',`/qa?case=${c.id}`)};
 const navigate=(next:string)=>{setPage(next);setReportId('');setCaseId('');setMobile(false);history.replaceState(null,'','/qa')};
 if(!state)return <main className="qa-loading"><h1>Relay</h1><p>{error||'Opening your workspace…'}</p>{error&&<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Try again</button>}</main>;
 const manager=['admin','qa'].includes(state.me.role),admin=state.me.role==='admin',report=state.reports.find(r=>r.id===reportId),selected=state.cases.find(c=>c.id===caseId);
 const visibleCases=state.cases.filter(c=>c.deleted===trash&&(report?c.reportId===report.id:!state.reports.find(r=>r.id===c.reportId)?.archived)).filter(c=>`${c.title} ${c.steps} ${c.actual} ${state.reports.find(r=>r.id===c.reportId)?.title}`.toLowerCase().includes(query.toLowerCase())&&(status==='all'||c.status===status)&&(severity==='all'||c.severity===severity)&&(developer==='all'||c.assigneeId===developer));
 const analyticsCases=visibleCases.filter(c=>!c.deleted&&(!analyticsReport||c.reportId===analyticsReport));
 const addWidget=(sourceReport:string)=>{setError('');setModal({type:'widget',data:{reportId:sourceReport}})};
 const editWidget=(widget:ChartWidget,legacy?:string)=>{setError('');setModal({type:'widget',data:{widget,legacy}})};
 const memberName=(id:string)=>state.members.find(m=>m.id===id)?.name||'Former member';
 const filters=<div className="qa-filters"><input aria-label="Search cases" placeholder="Search cases or reports" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{Object.keys(statusLabel).map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select><select aria-label="Filter severity" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="all">All severities</option>{['critical','high','medium','low'].map(s=><option key={s}>{s}</option>)}</select><select aria-label="Filter developer" value={developer} onChange={e=>setDeveloper(e.target.value)}><option value="all">All developers</option>{state.members.filter(m=>m.role!=='qa').map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>{manager&&<label className="qa-check"><input type="checkbox" checked={trash} onChange={e=>setTrash(e.target.checked)}/>Trash</label>}</div>;
 const caseTable=(items:QACase[])=>items.length?<div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>Case</th><th>Type</th><th>Severity</th><th>Developer</th><th>Status</th><th>Test result</th></tr></thead><tbody>{items.map(c=><tr key={c.id}><td><button className="qa-link" onClick={()=>openCase(c)}>{c.title}</button><small>{state.reports.find(r=>r.id===c.reportId)?.title}</small></td><td>{formatEnumLabel(c.kind)}</td><td><span className={`qa-severity ${c.severity}`}>{c.severity}</span></td><td>{memberName(c.assigneeId)}</td><td><Status value={c.status}/></td><td>{formatEnumLabel(c.result)}</td></tr>)}</tbody></table></div>:<Empty>No cases match these filters.{manager&&report&&!report.archived&&<button onClick={()=>setModal({type:'case',data:{reportId:report.id}})}>Add the first case</button>}</Empty>;
 return <div className={`qa-shell ${mobile?'qa-mobile-open':''}`}><aside className="qa-sidebar"><RelayLogo/><span className="qa-space-label">QUALITY WORKSPACE</span><select aria-label="Workspace" value={state.workspace.id} onChange={e=>{setWorkspace(e.target.value);setReportId('');setCaseId('');setAnalyticsReport('');setReportDashboard('');setPage('dashboard');history.replaceState(null,'','/qa')}}>{state.workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><nav>{[{id:'dashboard',label:'Dashboard',Icon:ChartBar},{id:'reports',label:'Reports',Icon:FileText},{id:'cases',label:'All cases',Icon:Bug},{id:'inbox',label:'Updates',Icon:Bell},...(admin?[{id:'users',label:'User management',Icon:Users}]:[]),{id:'settings',label:'Account settings',Icon:Gear}].map(({id,label,Icon})=><button className={page===id?'active':''} key={id} onClick={()=>navigate(id)}><Icon size={18}/>{label}{id==='inbox'&&state.notifications.some(n=>!n.read)&&<span className="qa-unread"/>}</button>)}</nav><Link href="/workspace" className="qa-project-link"><Folder size={17}/>Project workspace<ArrowUpRight size={14}/></Link><div className="qa-account"><strong>{state.me.name}</strong><small>{state.me.email}</small><span className="qa-badge">{state.me.role==='qa'?'QA':formatEnumLabel(state.me.role)}</span><button onClick={async()=>{await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});router.replace('/login')}}><SignOut/>Sign out</button></div></aside>{mobile&&<button className="qa-mobile-backdrop" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
 <div className="qa-main"><header className="qa-topbar"><button className="qa-mobile-toggle" aria-label="Open navigation" onClick={()=>setMobile(!mobile)}><List/></button><span>{state.workspace.name}<i>/</i>{page==='users'?'User management':formatEnumLabel(page)}</span><span className="qa-save">{busy?'Saving…':'Changes saved'}</span></header><main className="qa-content">{error&&<div className="qa-error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}{notice&&<div className="qa-notice">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></div>}
 {page==='dashboard'&&<>
  <div className="qa-heading">
   <div><h1>{state.dashboard.title}</h1><p>Track test results, bugs, and QA verification across reports.</p></div>
   {manager&&<div>
    <button onClick={()=>{setError('');setModal({type:'dashboard'})}}><Gear/>Manage dashboard</button>
    <button onClick={()=>setModal({type:'report'})}>New report</button>
   </div>}
  </div>
  <div className="qa-analytics-toolbar">
   <label>Report<select value={analyticsReport} onChange={event=>setAnalyticsReport(event.currentTarget.value)}>
    <option value="">All active reports</option>
    {state.reports.filter(r=>!r.archived).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
   </select></label>
  </div>
  {filters}
  <Dashboard cases={analyticsCases} state={state} reportId={analyticsReport} openCase={openCase}
    addWidget={manager?()=>addWidget(analyticsReport):undefined} editWidget={manager?editWidget:undefined}/>
  <div className="qa-section-heading"><h2>Cases awaiting verification</h2><button onClick={()=>{navigate('cases');setStatus('awaiting_verification')}}>View cases</button></div>
  {caseTable(analyticsCases.filter(c=>c.status==='awaiting_verification').slice(0,6))}
 </>}
 {page==='reports'&&!report&&<><div className="qa-heading"><div><h1>QA reports</h1><p>Group test cases and bugs by project, build, or test session.</p></div>{manager&&<button className="qa-primary" onClick={()=>setModal({type:'report'})}><Plus/>Create report</button>}</div><div className="qa-filters"><input aria-label="Search reports" placeholder="Search reports" value={query} onChange={e=>setQuery(e.target.value)}/>{manager&&<label className="qa-check"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Archived reports</label>}</div><div className="qa-reports">{state.reports.filter(r=>r.archived===archived&&`${r.title} ${r.build}`.toLowerCase().includes(query.toLowerCase())).map(r=>{const cases=state.cases.filter(c=>c.reportId===r.id&&!c.deleted);return <article key={r.id}><div><FileText size={23}/><span>{r.build||'No build specified'}</span></div><button className="qa-report-title" onClick={()=>openReport(r.id)}>{r.title}<ArrowUpRight/></button><p>{r.description||'No description added.'}</p><footer><span>{cases.length} cases</span><span>{cases.filter(c=>c.status==='closed').length} closed</span><span>{r.environment||'Environment not set'}</span></footer></article>})}</div>{!state.reports.some(r=>r.archived===archived)&&<Empty>{manager?'Create a report, then add bugs and test cases.':'Reports appear when a case is assigned to you.'}</Empty>}</>}
 {page==='reports'&&report&&!selected&&<><button className="qa-back" onClick={()=>navigate('reports')}><ArrowLeft/>All reports</button><div className="qa-heading"><div><span className="qa-kicker">QA REPORT{report.archived?' · ARCHIVED':''}</span><h1>{report.title}</h1><p>{report.description}</p></div><div><button onClick={()=>downloadCasesCsv(state.cases.filter(c=>c.reportId===report.id&&!c.deleted),state.reports,state.members)}>Export CSV</button><button onClick={()=>window.print()}>Print / PDF</button>{manager&&<><button onClick={()=>setModal({type:'report',data:report})}>Edit report</button><button onClick={()=>void submitQualityAction('report.archive',{archived:!report.archived},report.id,report.version)}>{report.archived?'Restore':'Archive'}</button>{!report.archived&&<><button onClick={()=>{setError('');setModal({type:'case.import',data:{reportId:report.id,title:report.title}})}}>Import CSV</button><button className="qa-primary" onClick={()=>setModal({type:'case',data:{reportId:report.id}})}><Plus/>Add bug / test case</button></>}</>}</div></div><div className="qa-facts"><span>Build<strong>{report.build||'Not set'}</strong></span><span>Environment<strong>{report.environment||'Not set'}</strong></span><span>Reported by<strong>{memberName(report.createdBy)}</strong></span><span>Created<strong>{formatTimestamp(report.createdAt)}</strong></span></div><div className="qa-report-tabs" aria-label="Report views">
 <button aria-pressed={reportDashboard!==report.id} onClick={()=>setReportDashboard('')}>Cases</button>
 <button aria-pressed={reportDashboard===report.id} onClick={()=>setReportDashboard(report.id)}>Dashboard</button>
 {reportDashboard!==report.id&&manager&&!report.archived&&<button className="qa-primary qa-report-add-widget"
  disabled={state.dashboard.widgets.length>=maxDashboardWidgets}
  onClick={()=>{setReportDashboard(report.id);addWidget(report.id)}}><Plus size={15}/>Add widget</button>}
</div>
{reportDashboard===report.id?
 <Dashboard cases={state.cases.filter(c=>c.reportId===report.id&&!c.deleted)} state={state} reportId={report.id}
  openCase={openCase} addWidget={manager&&!report.archived?()=>addWidget(report.id):undefined}
  editWidget={manager&&!report.archived?editWidget:undefined}/>:
 <>{filters}{caseTable(visibleCases)}<FilePanel state={state} reportId={report.id} caseId="" canUpload={manager&&!report.archived} refresh={refresh} setError={setError}/><Discussion state={state} reportId={report.id} caseId="" act={submitQualityAction} busy={busy}/><History entries={state.history.filter(h=>h.reportId===report.id&&!h.caseId)} memberName={memberName}/></>}</>}
 {page==='reports'&&report&&selected&&<><button className="qa-back" onClick={()=>{setCaseId('');history.replaceState(null,'',`/qa?report=${report.id}`)}}><ArrowLeft/>{report.title}</button><div className="qa-heading"><div><span className="qa-kicker">{formatEnumLabel(selected.kind)} · {selected.id.slice(0,8)}</span><h1>{selected.title}</h1><p><Status value={selected.status}/> <span className={`qa-severity ${selected.severity}`}>{selected.severity}</span>{selected.deleted&&' · In trash'}</p></div><div><button onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/qa?case=${selected.id}`);setNotice('Case link copied.')}catch{setNotice(`${location.origin}/qa?case=${selected.id}`)}}}>Copy link</button>{manager&&!report.archived&&<><button onClick={()=>setModal({type:'case',data:selected})}>Edit case</button><button onClick={()=>setModal({type:'case.delete',data:selected})}>{selected.deleted?'Restore':'Move to trash'}</button></>}</div></div><div className="qa-facts"><span>Developer<strong>{memberName(selected.assigneeId)}</strong></span><span>QA reporter<strong>{memberName(selected.createdBy)}</strong></span><span>Test result<strong>{formatEnumLabel(selected.result)}</strong></span><span>Updated<strong>{formatTimestamp(selected.updatedAt)}</strong></span></div><div className="qa-case-layout"><div><section className="qa-panel qa-case-details">{(['steps','expected','actual'] as const).map(f=><div key={f}><h3>{f==='steps'?'Steps to reproduce / test':f==='expected'?'Expected result':'Actual result'}</h3><p>{selected[f]||'Not recorded.'}</p></div>)}</section>{selected.resolution&&<section className="qa-panel"><h2>Latest developer response</h2><p className="qa-preserve">{selected.resolution}</p>{selected.resource&&<a href={selected.resource} target="_blank" rel="noopener noreferrer">Supporting resource ↗</a>}<small>Previous responses are retained in case history.</small></section>}<FilePanel state={state} reportId={report.id} caseId={selected.id} canUpload={!report.archived&&!selected.deleted} refresh={refresh} setError={setError}/><Discussion state={state} reportId={report.id} caseId={selected.id} act={submitQualityAction} busy={busy}/><History entries={state.history.filter(h=>h.caseId===selected.id)} memberName={memberName}/></div><aside className="qa-panel qa-case-actions"><h2>Case actions</h2>{report.archived||selected.deleted?<p>Restore this report and case to continue.</p>:<>{(admin||state.me.role==='developer')&&selected.status!=='closed'&&<><button className="qa-primary" onClick={()=>setModal({type:'case.respond',data:selected})}>Submit fix response</button>{['open','reopened','not_fixed'].includes(selected.status)&&<button onClick={()=>setModal({type:'case.transition',data:{...selected,next:'in_progress'}})}>Start development</button>}</>}{manager&&<><button onClick={()=>setModal({type:'case.execution',data:selected})}>Record test execution</button>{selected.status!=='closed'&&<button className="qa-primary" onClick={()=>setModal({type:'case.transition',data:{...selected,next:'closed'}})}>Verify and close case</button>}<button onClick={()=>setModal({type:'case.transition',data:{...selected,next:'reopened'}})}>Reopen case</button></>}<p>Developer fixes require QA verification. Responses and status changes are recorded.</p></>}</aside></div></>}
 {page==='cases'&&<><div className="qa-heading"><div><h1>{state.me.role==='developer'?'Assigned cases':'All cases'}</h1><p>Review bugs, test execution, and resolution status.</p></div><button onClick={()=>downloadCasesCsv(visibleCases,state.reports,state.members)}>Export CSV</button></div>{filters}{caseTable(visibleCases)}</>}
 {page==='inbox'&&<><div className="qa-heading"><div><h1>Updates</h1><p>Assignments and changes to your cases.</p></div></div>{state.notifications.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(n=><button key={n.id} className={`qa-update ${n.read?'':'unread'}`} onClick={async()=>{await fetch(`/api/relay?workspace=${state.workspace.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'notification.update',id:n.id,data:{read:true}})});const c=state.cases.find(c=>c.id===n.caseId);if(c)openCase(c);await refresh()}}><Bell/><span><strong>{n.title}</strong><small>{n.body} · {formatTimestamp(n.createdAt)}</small></span><ArrowUpRight/></button>)}{!state.notifications.length&&<Empty>No case updates yet.</Empty>}</>}
 {page==='users'&&admin&&<><div className="qa-heading"><div><h1>User management</h1><p>Invite Admins, Developers, and QA. Invitation links expire after 48 hours.</p></div><button className="qa-primary" onClick={()=>setModal({type:'user.invite'})}><Plus/>Invite user</button></div><div className="qa-table-scroll"><table className="qa-table"><thead><tr><th>User</th><th>Role</th><th>Account</th><th>Actions</th></tr></thead><tbody>{state.members.map(m=><tr key={m.id}><td><strong>{m.name}</strong><small>{m.email}</small></td><td>{m.userId===state.workspace.ownerId?'Admin (owner)':<select aria-label={`Role for ${m.name}`} value={m.role} onChange={e=>void submitQualityAction('user.role',{role:e.target.value},m.id)}><option value="admin">Admin</option><option value="developer">Developer</option><option value="qa">QA</option></select>}</td><td>{!m.userId?'Invited':m.disabled?'Disabled':'Active'}</td><td><div className="qa-user-actions">{!m.userId&&<button onClick={async()=>{const b=await submitQualityAction('user.inviteLink',undefined,m.id);if(b?.link)setModal({type:'link',data:{link:b.link}})}}>Invitation link</button>}{m.userId&&m.userId!==state.workspace.ownerId&&<><button onClick={async()=>{const b=await submitQualityAction('user.reset',undefined,m.id);if(b?.link)setModal({type:'link',data:{link:b.link}})}}>Reset password</button><button onClick={()=>setModal({type:m.disabled?'user.enable':'user.disable',data:m})}>{m.disabled?'Enable':'Disable'}</button></>}{m.userId!==state.workspace.ownerId&&<button onClick={()=>setModal({type:'user.remove',data:m})}>Remove</button>}</div></td></tr>)}</tbody></table></div><History entries={state.history.filter(h=>!h.reportId).slice(0,50)} memberName={memberName}/></>}
 {page==='settings'&&<AccountSettings me={state.me} setError={setError} setNotice={setNotice}/>}
 </main></div>{modal&&<QualityEditor key={modal.type+(modal.data&&'id' in modal.data?modal.data.id??'':'')} modal={modal} state={state} act={submitQualityAction} busy={busy} requestError={error} onImported={count=>{setQuery('');setStatus('all');setSeverity('all');setDeveloper('all');setTrash(false);setNotice(count===1?'1 case imported.':count+' cases imported.')}} close={closeEditor} setModal={setModal} openReport={openReport} openCase={openCase}/>}</div>
}
