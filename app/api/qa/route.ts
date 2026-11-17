import {AppError} from '../../../lib/server/store';
import {loadQualityWorkspace,executeQualityAction} from '../../../lib/server/qa';
import {checkOrigin,requireRequestWorkspace,readJsonBody,throttle} from '../../../lib/server/auth';
import {ZodError} from 'zod';
import {maxCaseCsvBytes} from '../../../lib/qa-csv';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(e:unknown){if(e instanceof AppError)return reply({error:e.message},e.status);if(e instanceof ZodError)return reply({error:e.issues[0]?.message||'Check the form.'},400);console.error('QA request failed',e instanceof Error?e.message:'Unknown');return reply({error:'Unable to complete the request.'},500)}
export async function GET(request:Request){try{return reply(await loadQualityWorkspace(await requireRequestWorkspace(request)))}catch(e){return fail(e)}}
export async function POST(request:Request){try{await checkOrigin(request);const ctx=await requireRequestWorkspace(request);await throttle(`qa:${ctx.me.id}`,180,60);
 // JSON can double the size of quotes, backslashes and newlines in a CSV file.
 const input=await readJsonBody(request,2*maxCaseCsvBytes+10000);
 const result=await executeQualityAction(ctx,input,new URL(request.url).origin);return reply({ok:true,...result})}catch(e){return fail(e)}}
