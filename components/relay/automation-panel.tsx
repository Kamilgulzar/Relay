'use client';

import {useCallback,useEffect,useState} from 'react';
import {assertions,keys,maxSteps,operations,pageActions,valueLabels} from '@/lib/automation.mjs';
import './automation.css';

type Action = keyof typeof operations;
type Step = {action:Action;target?:string;value?:string;name?:string};
type Plan = {origin:string;viewport:'desktop'|'mobile';steps:Step[]};
type NetworkIssue = {origin:string;method:string;resourceType:string;reason:'allowlist'|'http';status?:number};
type Run = {
  id:string;status:string;created_at:string;started_at:string|null;finished_at:string|null;
  mode?:'background'|'watch';
  evidence?:{message?:string;screenshot?:string;blockedResourceOrigins?:string[];networkIssues?:NetworkIssue[];steps:{action:Action;status:string;durationMs:number}[]};
};
type Frame = {image:string;step:{number:number;total:number;action:Action}|null};

const initialPlan: Plan = {origin:'',viewport:'desktop',steps:[
  {action:'open',value:'/'},{action:'visible',target:''},
]};
const usesTarget = (action:Action) => !pageActions.has(action);
const actionValueLabel = (action:Action) => (valueLabels as Partial<Record<Action,string>>)[action];
const active = (run:Run) => ['queued','running'].includes(run.status);
const statusLabel:Record<string,string> = {queued:'Queued',running:'Running',passed:'Passed',failed:'Failed',blocked:'Blocked',cancelled:'Cancelled'};

function newStep(action:Action):Step {
  return {
    action,
    ...(usesTarget(action) ? {target:''} : {}),
    ...(actionValueLabel(action) ? {value:action==='open' ? '/' : action==='press' ? 'Enter' : ''} : {}),
    ...(action==='attribute' ? {name:''} : {}),
  };
}

export default function AutomationPanel({workspace,caseId,editable}:{workspace:string;caseId:string;editable:boolean}) {
  const url = '/api/automation?'+new URLSearchParams({workspace,case:caseId});
  const [plan,setPlan] = useState(initialPlan);
  const [saved,setSaved] = useState<Plan|null>(null);
  const [runs,setRuns] = useState<Run[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [watchId,setWatchId] = useState('');
  const [frame,setFrame] = useState<Frame|null>(null);
  const [previewError,setPreviewError] = useState('');
  const pending = runs.some(active);
  const watched = runs.find(run=>run.id===watchId);
  const runningWatch = runs.find(run=>run.mode==='watch' && active(run));
  const dirty = JSON.stringify(plan)!==JSON.stringify(saved);

  const refresh = useCallback(async (signal?:AbortSignal) => {
    const response = await fetch(url,{signal,cache:'no-store'});
    const data = await response.json() as {plan:Plan|null;runs:Run[];error?:string};
    if (!response.ok) throw new Error(data.error || 'Could not load automated testing.');
    return data;
  },[url]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setPlan(data.plan ?? initialPlan);setSaved(data.plan);setRuns(data.runs);setLoaded(true);
    }).catch(error => {if (!controller.signal.aborted) setError(error.message);});
    return () => controller.abort();
  },[refresh]);

  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();
    const interval = setInterval(() => {
      refresh(controller.signal).then(data => {
        if (!controller.signal.aborted) setRuns(data.runs);
      }).catch(() => {});
    },2500);
    return () => {controller.abort();clearInterval(interval);};
  },[pending,refresh]);

  useEffect(() => {
    if (!watchId || (watched && !active(watched))) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(url+'&run='+encodeURIComponent(watchId),{signal:controller.signal,cache:'no-store'});
        if (!response.ok) throw new Error('Preview unavailable.');
        const update = await response.json() as {status:string;live_preview:Frame|null};
        if (controller.signal.aborted) return;
        if (update.live_preview) setFrame(update.live_preview);
        setPreviewError('');
        if (!['queued','running'].includes(update.status)) {
          const data = await refresh(controller.signal);
          if (!controller.signal.aborted) setRuns(data.runs);
          return;
        }
      } catch {
        if (!controller.signal.aborted) setPreviewError('Preview connection interrupted. Retrying…');
      }
      if (!controller.signal.aborted) timer=setTimeout(poll,850);
    }
    void poll();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[watchId,watched?.status,url,refresh]);

  function watch(runId:string) {
    setFrame(null);setPreviewError('');setWatchId(runId);
  }

  async function submit(action:'save'|'run'|'cancel',runId?:string,mode:'background'|'watch'='background') {
    setBusy(true);setError('');setNotice('');
    try {
      const response = await fetch(url,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,...(action==='save'?{plan}:{}),runId,mode}),
      });
      const result = await response.json() as {error?:string;runId?:string};
      if (!response.ok) throw new Error(result.error || 'Could not update automated testing.');
      if (action==='run' && mode==='watch' && result.runId) watch(result.runId);
      const data = await refresh();
      setSaved(data.plan);setRuns(data.runs);
      if (action==='save' && data.plan) setPlan(data.plan);
      setNotice(action==='save'?'Test plan saved.':action==='run'?'Run queued.':'Run cancelled.');
    } catch(error) {
      setError(error instanceof Error ? error.message : 'Could not update automated testing.');
    } finally {setBusy(false);}
  }

  function updateStep(index:number,step:Step) {
    setPlan(current=>({...current,steps:current.steps.map((old,i)=>i===index?step:old)}));
  }
  function moveStep(index:number,direction:number) {
    setPlan(current=>{
      const steps = [...current.steps];
      [steps[index],steps[index+direction]] = [steps[index+direction],steps[index]];
      return {...current,steps};
    });
  }

  return <section className="qa-panel relay-automation" aria-label="Automated testing">
    <header><h2>Automated testing</h2><p>Run browser checks and review each step. The case’s recorded QA result is managed separately.</p></header>
    {error && <p role="alert" className="relay-auto-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!loaded && !error && <p role="status">Loading test plan…</p>}
    {loaded && editable && <form onSubmit={event=>{event.preventDefault();void submit('save');}}>
      <fieldset disabled={busy}>
        <div className="relay-auto-config">
          <label>Website origin<input type="url" required value={plan.origin} placeholder="https://example.com" onChange={event=>setPlan({...plan,origin:event.target.value})}/></label>
          <label>Viewport<select value={plan.viewport} onChange={event=>setPlan({...plan,viewport:event.target.value as Plan['viewport']})}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
        </div>
        <p className="relay-auto-hint">Use an approved HTTPS origin and a CSS selector for each element. Use test data only.</p>
        <ol className="relay-auto-steps">
          {plan.steps.map((step,index)=><li key={index}>
            <span className="relay-auto-number" aria-hidden="true">{index+1}</span>
            <div>
              <label>Action<select value={step.action} onChange={event=>updateStep(index,newStep(event.target.value as Action))}>
                {['Browser actions','Checks'].map((group,i)=><optgroup key={group} label={group}>
                  {Object.entries(operations).filter(([action])=>assertions.has(action)===Boolean(i)).map(([action,label])=><option key={action} value={action}>{label}</option>)}
                </optgroup>)}
              </select></label>
              {usesTarget(step.action) && <label>Element selector<input required maxLength={300} placeholder='input[name="email"]' value={step.target} onChange={event=>updateStep(index,{...step,target:event.target.value})}/></label>}
              {step.action==='attribute' && <label>Attribute name<input required maxLength={80} value={step.name} onChange={event=>updateStep(index,{...step,name:event.target.value})}/></label>}
              {step.action==='press' ? <label>Key<select value={step.value} onChange={event=>updateStep(index,{...step,value:event.target.value})}>{keys.map(key=><option key={key}>{key}</option>)}</select></label> :
                actionValueLabel(step.action) && <label>{actionValueLabel(step.action)}<input required={!['fill','value','attribute'].includes(step.action)} maxLength={step.action==='drag'?300:500} inputMode={step.action==='count'?'numeric':undefined} pattern={step.action==='count'?'0|[1-9][0-9]{0,4}':undefined} value={step.value} onChange={event=>updateStep(index,{...step,value:event.target.value})}/></label>}
            </div>
            <div className="relay-auto-order">
              <button type="button" disabled={index===0} aria-label={'Move step '+(index+1)+' up'} onClick={()=>moveStep(index,-1)}>↑</button>
              <button type="button" disabled={index===plan.steps.length-1} aria-label={'Move step '+(index+1)+' down'} onClick={()=>moveStep(index,1)}>↓</button>
              <button type="button" disabled={plan.steps.length<=2} aria-label={'Remove step '+(index+1)} onClick={()=>setPlan({...plan,steps:plan.steps.filter((_,i)=>i!==index)})}>Remove</button>
            </div>
          </li>)}
        </ol>
        <div className="relay-auto-actions">
          <button type="button" disabled={plan.steps.length>=maxSteps} onClick={()=>setPlan({...plan,steps:[...plan.steps,newStep('click')]})}>Add step</button>
          <button type="submit" disabled={!dirty}>Save plan</button>
          <button type="button" disabled={dirty||pending||!saved} onClick={()=>void submit('run')}>Run in background</button>
          <button type="button" className="qa-primary" disabled={dirty||pending||!saved} onClick={()=>void submit('run',undefined,'watch')}>Run and watch</button>
        </div>
      </fieldset>
    </form>}
    {runningWatch && !watchId && <button type="button" onClick={()=>watch(runningWatch.id)}>Watch current run</button>}
    {watchId && <section className="relay-auto-preview" aria-label="Browser preview">
      <div className="relay-auto-preview-bar">
        <strong>Browser preview</strong>
        <span role="status">{statusLabel[watched?.status ?? 'queued']}</span>
        <button type="button" onClick={()=>{setWatchId('');setFrame(null);}}>Close preview</button>
      </div>
      {previewError && <p role="status">{previewError}</p>}
      {frame?.step && <p>Step {frame.step.number} of {frame.step.total} · {operations[frame.step.action]}</p>}
      {frame ? <img alt="Latest automated browser frame" src={'data:image/jpeg;base64,'+frame.image}/> :
        <p>{watched && !active(watched) ? 'This run ended without a preview. See Run history.' : 'Waiting for the first browser frame…'}</p>}
    </section>}
    {loaded && <div className="relay-auto-history">
      <h3>Run history</h3>
      {!runs.length && <p>No automated runs yet.</p>}
      {runs.map(run=><details key={run.id}>
        <summary><span className={'relay-auto-status '+run.status}>{statusLabel[run.status]}</span><time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time> <small>{run.mode==='watch'?'Watch':'Background'}</small></summary>
        {run.status==='queued' && <p>Waiting for the Relay runner.{editable && <> <button disabled={busy} onClick={()=>void submit('cancel',run.id)}>Cancel run</button></>}</p>}
        {run.evidence?.message && <p>{run.evidence.message}</p>}
        {!!run.evidence?.networkIssues?.length ? (
          <details>
            <summary>Network request errors</summary>
            <ul>{run.evidence.networkIssues.map((issue,index)=><li key={index}>
              {issue.method} {issue.origin} ({issue.resourceType}) · {issue.reason==='allowlist' ? 'Blocked by runner allowlist' : `HTTP ${issue.status}`}
            </li>)}</ul>
          </details>
        ) : !!run.evidence?.blockedResourceOrigins?.length && (
          <p>Origins blocked by the runner allowlist: {run.evidence.blockedResourceOrigins.join(', ')}</p>
        )}
        {!!run.evidence?.steps.length && <ol>{run.evidence.steps.map((step,index)=><li key={index}>{operations[step.action]} · {statusLabel[step.status]} · {step.durationMs} ms</li>)}</ol>}
        {run.evidence?.screenshot && <a download="relay-test-failure.jpg" href={'data:image/jpeg;base64,'+run.evidence.screenshot}>Download failure screenshot</a>}
      </details>)}
    </div>}
  </section>;
}
