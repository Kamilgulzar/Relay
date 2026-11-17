import {z} from 'zod';
export class DomainValidationError extends Error {}
export const identifier=z.string().min(1).max(120);
const name=z.string().trim().min(1,'Please enter a name.').max(180);
export const date=z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Enter a valid date.')]);
const fieldSchema=z.object({id:identifier,name,type:z.enum(['text','number','date','select']),options:z.array(z.string().max(80)).max(30).default([])});
export const taskInput=z.object({name,description:z.string().max(30000).default(''),projectId:z.string().max(120).default(''),projectIds:z.array(identifier).max(20).default([]),sectionId:z.string().max(120).default(''),parentId:z.string().max(120).default(''),assigneeId:z.string().max(120).default(''),collaboratorIds:z.array(identifier).max(100).default([]),startDate:date.default(''),dueDate:date.default(''),priority:z.enum(['none','low','medium','high','urgent']).default('none'),status:z.enum(['on_track','at_risk','off_track','on_hold']).default('on_track'),completed:z.boolean().default(false),tags:z.array(z.string().trim().min(1).max(40)).max(30).default([]),custom:z.record(z.string().max(2000)).default({}),dependencies:z.array(identifier).max(50).default([]),recurrence:z.enum(['','daily','weekly','monthly']).default(''),order:z.number().finite().default(0),estimate:z.number().min(0).max(100000).default(0),timeSpent:z.number().min(0).max(100000).default(0)});
export const taskPatch=taskInput.partial().extend({deleted:z.boolean().optional()});
export const projectInput=z.object({name,description:z.string().max(20000).default(''),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#de795d'),icon:z.string().max(40).default('layers'),status:z.enum(['on_track','at_risk','off_track','on_hold','complete']).default('on_track'),dueDate:date.default(''),sections:z.array(z.object({id:identifier,name})).min(1).max(50),fields:z.array(fieldSchema).max(30).default([]),memberIds:z.array(identifier).max(100).default([]),teamId:z.string().max(120).default(''),archived:z.boolean().default(false),starred:z.boolean().default(false),privacy:z.enum(['workspace','private']).default('workspace')});
export function assertDateRange(start:string,due:string){if(start&&due&&start>due)throw new DomainValidationError('Start date must be on or before the due date.')}
export function assertNoCycle(taskId:string,dependencies:string[],tasks:{id:string;dependencies:string[]}[]){const map=new Map(tasks.map(t=>[t.id,t.id===taskId?dependencies:t.dependencies]));const active=new Set<string>(),done=new Set<string>();function visit(id:string){if(active.has(id))throw new DomainValidationError('This dependency would create a cycle.');if(done.has(id))return;active.add(id);for(const dep of map.get(id)??[])visit(dep);active.delete(id);done.add(id)}visit(taskId)}

export const workspaceActionResponseSchema = z.object({
 ok:z.literal(true),
 id:identifier.optional(),
 workspaceId:identifier.optional(),
});
export const apiErrorSchema = z.object({error:z.string()});
export type SubmitWorkspaceAction = (
 action:string,data?:unknown,id?:string,kind?:string,version?:number,
) => Promise<z.infer<typeof workspaceActionResponseSchema> | {ok:false}>;
