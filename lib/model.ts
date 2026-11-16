export const colors=['#de795d','#668ca8','#84936a','#b291bc','#c9a65e','#729e95'];
export type Kind='project'|'task'|'comment'|'attachment'|'event'|'notification'|'team'|'portfolio'|'goal'|'rule'|'form'|'document'|'preference'|'qa_report'|'qa_case'|'qa_comment'|'qa_history'|'qa_attachment'|'qa_dashboard';
export type Member={id:string;workspaceId:string;userId:string|null;email:string;name:string;role:'admin'|'developer'|'qa';color:string};
export type Field={id:string;name:string;type:'text'|'number'|'date'|'select';options:string[]};
export type Project={id:string;name:string;description:string;color:string;icon:string;status:string;dueDate:string;sections:{id:string;name:string}[];fields:Field[];memberIds:string[];teamId:string;archived:boolean;starred:boolean;privacy:'workspace'|'private'};
export type Task={id:string;name:string;description:string;projectId:string;projectIds:string[];sectionId:string;parentId:string;assigneeId:string;collaboratorIds:string[];startDate:string;dueDate:string;priority:string;status:string;completed:boolean;completedAt:string;tags:string[];custom:Record<string,string>;dependencies:string[];recurrence:string;createdBy:string;createdAt:string;order:number;deleted:boolean;version:number;estimate:number;timeSpent:number};
export type Comment={id:string;taskId:string;memberId:string;body:string;createdAt:string;editedAt?:string};
export type Attachment={id:string;taskId:string;name:string;size:number;mime:string;key:string;createdAt:string;memberId:string};
export type Activity={id:string;taskId:string;projectId:string;memberId:string;body:string;createdAt:string};
export type Notification={id:string;memberId:string;taskId:string;title:string;body:string;read:boolean;archived:boolean;bookmarked:boolean;createdAt:string};
export type Team={id:string;name:string;description:string;memberIds:string[]};
export type Portfolio={id:string;name:string;description:string;projectIds:string[];color:string};
export type Goal={id:string;name:string;description:string;ownerId:string;dueDate:string;progress:number;target:number;current:number;status:string;projectIds:string[]};
export type Rule={id:string;projectId:string;name:string;trigger:'completed'|'created'|'moved';action:'set_priority'|'set_status'|'assign'|'move';value:string;enabled:boolean};
export type Form={id:string;projectId:string;name:string;description:string;fields:{label:string;required:boolean;type:'text'|'textarea'|'date'}[]};
export type Document={id:string;projectId:string;title:string;body:string;updatedAt:string;memberId:string};
export type Preference={id:string;memberId:string;theme:string;weekStart:string;emailNotifications:boolean;compact:boolean;name:string};
export type AppState={workspace:{id:string;name:string;ownerId:string};workspaces:{id:string;name:string}[];me:Member;members:Member[];projects:Project[];tasks:Task[];comments:Comment[];attachments:Attachment[];events:Activity[];notifications:Notification[];teams:Team[];portfolios:Portfolio[];goals:Goal[];rules:Rule[];forms:Form[];documents:Document[];preferences:Preference[]};
export function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'R'}
export function dateLabel(date:string){if(!date)return '';return new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function isOverdue(task:Task){return !!task.dueDate&&!task.completed&&task.dueDate<today()}
export function canSeeProject(project:Project,member:Member){return member.role==='admin'||project.privacy==='workspace'||project.memberIds.includes(member.id)}
export function progress(tasks:Task[]){return tasks.length?Math.round(tasks.filter(t=>t.completed).length/tasks.length*100):0}
