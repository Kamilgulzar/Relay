'use client';

import {useState} from 'react';
import {ArrowUpRight, PencilSimple, Plus, ChartBar as ChartIcon} from '@phosphor-icons/react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  caseKinds,caseResults,caseSeverities,caseStatuses,chartGroups,legacyChart,maxDashboardWidgets,
  type ChartWidget,
} from '../../lib/qa-dashboard';
import type {QACase} from '../../lib/server/qa';
import type {QualityWorkspace} from './quality-parts';
import './qa-dashboard.css';

const palette=['#60784f','#7167a6','#b46b58','#3d8690','#a17a36','#5870a6','#a06186','#607d86'];
const bugsByState:ChartWidget={
  id:'bugs-by-state',title:'Bugs by state',type:'donut',group:'status',
  metric:'count',labels:false,filters:{kind:'bug'},
};
const captions:Partial<Record<ChartWidget['group'],Record<string,string>>> = {
  kind:caseKinds, status:caseStatuses, severity:caseSeverities, result:caseResults,
};

function filterCases(cases:QACase[],filters:ChartWidget['filters']){
  const {from,to,...fields}=filters;
  return cases.filter(c=>{
    const day=c.createdAt.slice(0,10);
    return (!from||day>=from)&&(!to||day<=to)&&
      Object.entries(fields).every(([field,value])=>!value||c[field as keyof QACase]===value);
  });
}

function groupValue(c:QACase,field:ChartWidget['group']){
  return field==='createdAt'?c.createdAt.slice(0,10):c[field]||'';
}

function label(value:string,field:ChartWidget['group'],state:QualityWorkspace){
  if(field==='assigneeId')return state.members.find(m=>m.id===value)?.name||(value?'Former developer':'Unassigned');
  if(field==='reportId')return state.reports.find(r=>r.id===value)?.title||'Former report';
  return captions[field]?.[value]||value;
}

function chartData(cases:QACase[],widget:ChartWidget,state:QualityWorkspace){
  const group=widget.type==='line'?'createdAt':widget.group;
  const series=widget.type==='grouped'||widget.type==='stacked'?widget.series:undefined;
  const values=new Map<string,QACase[]>();
  if(widget.id===bugsByState.id&&cases.length){
    for(const status of Object.keys(caseStatuses))values.set(status,[]);
  }
  for(const item of cases){
    const value=groupValue(item,group);
    const bucket=values.get(value);
    if(bucket)bucket.push(item);
    else values.set(value,[item]);
  }
  const seriesKeys=series?[...new Set(cases.map(c=>groupValue(c,series)))].sort():[];
  const data=[...values].map(([id,items])=>{
    const row:Record<string,string|number>={id,name:label(id,group,state),count:items.length};
    if(series){
      const counts=new Map<string,number>();
      for(const item of items){
        const key=groupValue(item,series);
        counts.set(key,(counts.get(key)||0)+1);
      }
      seriesKeys.forEach((key,index)=>{row['series'+index]=counts.get(key)||0});
    }
    return row;
  });
  if(widget.id!==bugsByState.id){
    data.sort((a,b)=>group==='createdAt'?String(a.id).localeCompare(String(b.id)):
      Number(b.count)-Number(a.count)||String(a.name).localeCompare(String(b.name)));
  }
  return {data,seriesNames:series?seriesKeys.map(key=>label(key,series,state)):[]};
}

export function WidgetChart({widget,cases,state,openCase,preview=false}:{
  widget:ChartWidget;cases:QACase[];state:QualityWorkspace;openCase?:(c:QACase)=>void;preview?:boolean;
}){
  const [groupId,setGroupId]=useState<string|null>(null);
  const [showCases,setShowCases]=useState(false);
  const relevant=filterCases(cases,widget.filters);
  const {data,seriesNames}=chartData(relevant,widget,state);
  const number=widget.type==='number';
  const text=widget.type==='text';
  const decided=relevant.filter(c=>c.kind==='test_case'&&(c.result==='passed'||c.result==='failed'));
  const passRate=number&&widget.metric==='pass_rate';
  const metric=passRate?(decided.length?`${Math.round(decided.filter(c=>c.result==='passed').length/decided.length*100)}%`:'—'):relevant.length;
  const chartGroup=widget.type==='line'?'createdAt':widget.group;
  const filtered=passRate?decided:groupId===null?relevant:relevant.filter(c=>groupValue(c,chartGroup)===groupId);
  if(text)return <p className="qa-widget-note">{widget.note||'Enter text for this widget.'}</p>;
  return <>
    {number?<div className="qa-widget-number"><strong>{metric}</strong><span>{passRate?'Pass rate among passed or failed tests':'Matching cases'}</span></div>:
    data.length===0?<div className="qa-widget-empty"><ChartIcon size={25}/>No matching cases</div>:
    <div className="qa-widget-plot" aria-hidden="true" style={widget.type==='donut'?undefined:{minWidth:Math.min(1200,Math.max(0,data.length*42))}}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {widget.type==='donut'?<PieChart>
          <Pie data={data} dataKey="count" nameKey="name" innerRadius="56%" outerRadius="80%" paddingAngle={data.length>1?2:0} label={widget.labels} isAnimationActive={false}>
            {data.map((row,i)=><Cell key={row.id} fill={palette[i%palette.length]}/>)}
          </Pie><Tooltip/>
        </PieChart>:widget.type==='line'?<LineChart data={data} margin={{top:18,right:18,bottom:4,left:0}}>
          <CartesianGrid vertical={false} stroke="#e7ebdf"/><XAxis dataKey="name" tickMargin={8}/><YAxis allowDecimals={false} width={35}/><Tooltip/>
          <Line name="Cases added" dataKey="count" stroke={palette[0]} strokeWidth={3} dot label={widget.labels?{position:'top'}:false} isAnimationActive={false}/>
        </LineChart>:<BarChart data={data} margin={{top:18,right:12,bottom:4,left:0}}>
          <CartesianGrid vertical={false} stroke="#e7ebdf"/><XAxis dataKey="name" tickMargin={8}/><YAxis allowDecimals={false} width={35}/><Tooltip/>
          {seriesNames.length>0&&<Legend/>}
          {seriesNames.length?seriesNames.map((name,i)=><Bar key={i} dataKey={'series'+i} name={name} stackId={widget.type==='stacked'?'cases':undefined}
            fill={palette[i%palette.length]} maxBarSize={56} isAnimationActive={false}
            label={widget.labels?{position:widget.type==='stacked'?'inside':'top',fill:widget.type==='stacked'?'#fff':'#24321d',
              formatter:(value:unknown)=>Number(value)>0?String(value):''}:false}/>):<Bar dataKey="count" name="Cases" fill={palette[0]} maxBarSize={56}
              radius={[4,4,0,0]} label={widget.labels?{position:'top'}:false} isAnimationActive={false}/>}
        </BarChart>}
      </ResponsiveContainer>
    </div>}
    {!number&&data.length>0&&<div className="qa-widget-legend" aria-label={chartGroups[chartGroup]}>
      {data.map((row,i)=><button disabled={preview||row.count===0} key={row.id} aria-pressed={groupId===row.id}
        title={seriesNames.length?seriesNames.map((name,index)=>`${name}: ${row['series'+index]}`).join(', '):undefined}
        onClick={()=>setGroupId(groupId===row.id?null:String(row.id))}>
        <i style={{background:widget.type==='donut'?palette[i%palette.length]:palette[0]}}/>{row.name}<strong>{row.count}</strong>
      </button>)}
    </div>}
    {!preview&&openCase&&filtered.length>0&&<details className="qa-widget-cases" onToggle={event=>setShowCases(event.currentTarget.open)}>
      <summary>View {filtered.length} {filtered.length===1?'case':'cases'}</summary>
      {showCases&&filtered.map(c=><button className="qa-queue-item" key={c.id} onClick={()=>openCase(c)}>{c.title}<ArrowUpRight size={14}/></button>)}
    </details>}
  </>;
}

export default function Dashboard({cases,state,openCase,editWidget,addWidget,reportId}:{
  cases:QACase[];state:QualityWorkspace;openCase:(c:QACase)=>void;
  editWidget?:(widget:ChartWidget,legacy?:string)=>void;addWidget?:()=>void;reportId?:string;
}){
  const stats=[
    ['Total cases',cases.length],['Test cases',cases.filter(c=>c.kind==='test_case').length],
    ['Open bugs',cases.filter(c=>c.kind==='bug'&&c.status!=='closed').length],
    ['Awaiting QA',cases.filter(c=>c.status==='awaiting_verification').length],
  ] as const;
  return <>
    <div className="qa-analytics-metrics">{stats.map(([name,value])=><div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
    <div className="qa-charts-heading">
      <h2>Charts</h2>
      {addWidget&&<button className="qa-primary" disabled={state.dashboard.widgets.length>=maxDashboardWidgets}
        onClick={addWidget}><Plus size={16}/>Add widget</button>}
    </div>
    <div className="qa-analytics-grid">
      <section className="qa-panel qa-chart-card">
        <header><h2>{bugsByState.title}</h2></header>
        <WidgetChart widget={bugsByState} cases={cases} state={state} openCase={openCase}/>
      </section>
      {state.dashboard.widgets.map(item=>{
      const widget=typeof item==='string'?legacyChart(item):item;
      if(reportId&&widget.filters.reportId&&reportId!==widget.filters.reportId)return null;
      return <section className="qa-panel qa-chart-card" key={widget.id}>
        <header><h2>{widget.title}</h2>{editWidget&&
          <button aria-label={`Edit ${widget.title}`} onClick={()=>editWidget(widget,typeof item==='string'?item:undefined)}><PencilSimple size={16}/></button>}</header>
        <WidgetChart widget={widget} cases={cases} state={state} openCase={openCase}/>
      </section>;
    })}</div>
  </>;
}
