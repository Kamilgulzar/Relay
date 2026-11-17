'use client';

import {
  caseKinds,caseResults,caseSeverities,caseStatuses,chartGroups,chartTypes,type ChartWidget,
} from '../../lib/qa-dashboard';
import type {QACase} from '../../lib/server/qa';
import type {QualityWorkspace} from './quality-parts';
import {WidgetChart} from './qa-dashboard';

export function WidgetEditor({widget,change,state,cases}:{
  widget:ChartWidget;change:(widget:ChartWidget)=>void;state:QualityWorkspace;cases:QACase[];
}){
  function filter<K extends keyof ChartWidget['filters']>(key:K,value:ChartWidget['filters'][K]){
    change({...widget,filters:{...widget.filters,[key]:value}});
  }
  function options(values:Record<string,string>){
    return Object.entries(values).map(([value,name])=><option key={value} value={value}>{name}</option>);
  }
  function selectFilter<K extends 'kind'|'severity'|'status'|'result'>(key:K,title:string,values:Record<string,string>){
    return <label>{title}<select value={widget.filters[key]||''}
      onChange={event=>filter(key,(event.currentTarget.value||undefined) as ChartWidget['filters'][K])}>
      <option value="">All</option>{options(values)}
    </select></label>;
  }
  const split=widget.type==='stacked'||widget.type==='grouped';
  const groupedChart=widget.type!=='number'&&widget.type!=='text'&&widget.type!=='line';
  return <>
    <p>Widgets are shared with the workspace. Use the Report filter to limit the cases a chart includes.</p>
    <label>Widget title<input required maxLength={180} value={widget.title}
      onChange={event=>change({...widget,title:event.currentTarget.value})}/></label>
    <div className="qa-form-row">
      <label>Chart type<select value={widget.type} onChange={event=>change({...widget,type:event.currentTarget.value as ChartWidget['type']})}>
        {options(chartTypes)}
      </select></label>
      {groupedChart&&<label>Group by<select value={widget.group}
        onChange={event=>{const group=event.currentTarget.value as ChartWidget['group'];change({...widget,group,series:widget.series===group?undefined:widget.series})}}>
        {options(chartGroups)}
      </select></label>}
      {widget.type==='number'&&<label>Measure<select value={widget.metric}
        onChange={event=>change({...widget,metric:event.currentTarget.value as ChartWidget['metric']})}>
        <option value="count">Case count</option><option value="pass_rate">Test pass rate</option>
      </select></label>}
    </div>
    {split&&<label>Split bars by<select required value={widget.series||''}
      onChange={event=>change({...widget,series:(event.currentTarget.value||undefined) as ChartWidget['series']})}>
      <option value="">Choose a field</option>
      {options(Object.fromEntries(Object.entries(chartGroups).filter(([key])=>key!==widget.group)))}
    </select></label>}
    {widget.type==='text'?<label>Text<textarea required rows={4} maxLength={2000} value={widget.note||''}
      onChange={event=>change({...widget,note:event.currentTarget.value})}/></label>:<>
      {widget.type==='line'&&<p>Shows how many cases were added each day.</p>}
      {widget.type!=='number'&&<label className="qa-check"><input type="checkbox" checked={widget.labels}
        onChange={event=>change({...widget,labels:event.currentTarget.checked})}/>Show data labels</label>}
      <details className="qa-widget-filter">
        <summary>Filters</summary>
        <div className="qa-form-row">
          <label>Report<select aria-label="Report" value={widget.filters.reportId||''} onChange={event=>filter('reportId',event.currentTarget.value||undefined)}>
            <option value="">All reports</option>
            {state.reports.filter(report=>!report.archived||report.id===widget.filters.reportId).map(report=><option key={report.id} value={report.id}>{report.title}</option>)}
          </select></label>
          <label>Developer<select value={widget.filters.assigneeId||''} onChange={event=>filter('assigneeId',event.currentTarget.value||undefined)}>
            <option value="">All developers</option>
            {state.members.filter(member=>member.role!=='qa').map(member=><option key={member.id} value={member.id}>{member.name}</option>)}
          </select></label>
          {selectFilter('kind','Case type',caseKinds)}{selectFilter('status','Status',caseStatuses)}
          {selectFilter('severity','Severity',caseSeverities)}{selectFilter('result','Test result',caseResults)}
          <label>Added from<input type="date" value={widget.filters.from||''} onChange={event=>filter('from',event.currentTarget.value||undefined)}/></label>
          <label>Added through<input type="date" value={widget.filters.to||''} onChange={event=>filter('to',event.currentTarget.value||undefined)}/></label>
        </div>
      </details>
    </>}
    <section className="qa-widget-preview" aria-label="Widget preview">
      <h3>Preview</h3><WidgetChart widget={widget} state={state} cases={cases} preview/>
    </section>
  </>;
}
