import {z} from 'zod';

export const chartTypes = {
  bar:'Bar', stacked:'Stacked bar', grouped:'Grouped bar', donut:'Donut',
  line:'Line', number:'Number', text:'Text',
} as const;
export const chartGroups = {
  status:'Case status', severity:'Severity', result:'Test result', assigneeId:'Developer',
  kind:'Case type', reportId:'Report', createdAt:'Date added',
} as const;
export const caseStatuses = {
  open:'Open', in_progress:'In progress', awaiting_verification:'Awaiting QA',
  not_fixed:'Not fixed', closed:'Closed', reopened:'Reopened',
} as const;
export const caseResults = {not_run:'Not run',passed:'Passed',failed:'Failed',blocked:'Blocked'} as const;
export const caseSeverities = {critical:'Critical',high:'High',medium:'Medium',low:'Low'} as const;
export const caseKinds = {bug:'Bug',test_case:'Test case'} as const;
export const legacyWidgets = {
  status:'Case status', severity:'Bug severity', developers:'Cases by developer',
  verification:'QA verification queue', execution:'Test execution results',
} as const;
export const maxDashboardWidgets = 20;
const reference = z.string().max(120);
function enumKeys<T extends Record<string,string>>(map:T){
  return Object.keys(map) as [keyof T & string,...(keyof T & string)[]];
}
export const widgetSchema = z.object({
  id:z.string().uuid(),
  title:z.string().trim().min(1).max(180),
  type:z.enum(enumKeys(chartTypes)),
  group:z.enum(enumKeys(chartGroups)),
  series:z.enum(enumKeys(chartGroups)).optional(),
  metric:z.enum(['count','pass_rate']).default('count'),
  labels:z.boolean().default(true),
  note:z.string().trim().max(2000).optional(),
  filters:z.object({
    kind:z.enum(enumKeys(caseKinds)).optional(), status:z.enum(enumKeys(caseStatuses)).optional(),
    result:z.enum(enumKeys(caseResults)).optional(), severity:z.enum(enumKeys(caseSeverities)).optional(),
    reportId:reference.optional(), assigneeId:reference.optional(),
    from:z.string().date().optional(), to:z.string().date().optional(),
  }).strict(),
}).strict().superRefine((widget,ctx)=>{
  if ((widget.type==='stacked'||widget.type==='grouped')&&(!widget.series||widget.series===widget.group)) {
    ctx.addIssue({code:'custom',path:['series'],message:'Choose a different field to split the bars.'});
  }
  if(widget.type==='text'&&!widget.note)ctx.addIssue({code:'custom',path:['note'],message:'Enter the text to display.'});
  const {from,to}=widget.filters;
  if(from&&to&&from>to)ctx.addIssue({code:'custom',path:['filters'],message:'The start date must be before or equal to the end date.'});
});
export const dashboardWidgetsSchema=z.array(z.union([z.enum(enumKeys(legacyWidgets)),widgetSchema]))
 .max(maxDashboardWidgets).superRefine((widgets,ctx)=>{
  const ids=widgets.map(widget=>typeof widget==='string'?widget:widget.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Dashboard widgets must be unique.'});
 });

export type ChartWidget = z.infer<typeof widgetSchema>;
export type DashboardWidget = z.infer<typeof dashboardWidgetsSchema>[number];
export type Dashboard = {id:string;title:string;widgets:DashboardWidget[];version:number};

export const defaultDashboard:Dashboard={
  id:'qa_dashboard',title:'Quality dashboard',version:0,
  widgets:['status','severity','execution','developers','verification'],
};

export function legacyChart(widget:Exclude<DashboardWidget,ChartWidget>):ChartWidget {
  const base:ChartWidget={id:widget,title:legacyWidgets[widget],type:'bar',group:'status',metric:'count',labels:true,filters:{}};
  switch(widget){
    case 'status': return {...base,type:'donut'};
    case 'severity': return {...base,group:'severity',filters:{kind:'bug'}};
    case 'execution': return {...base,type:'donut',group:'result',filters:{kind:'test_case'}};
    case 'developers': return {...base,type:'stacked',group:'assigneeId',series:'status'};
    case 'verification': return {...base,type:'number',filters:{status:'awaiting_verification'}};
  }
}
