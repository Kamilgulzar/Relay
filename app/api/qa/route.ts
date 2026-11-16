import {getChatGPTUser} from '../../chatgpt-auth';
import {identityWorkspace,AppError} from '../../../lib/server/store';
import {qaState,qaAction} from '../../../lib/server/qa';
import {checkOrigin,readJSON,throttle} from '../../../lib/server/auth';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function context(request:Request){const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');return identityWorkspace(user,new URL(request.url).searchParams.get('workspace')||undefined)}
function fail(e:unknown){if(e instanceof AppError)return reply({error:e.message},e.status);if(e instanceof ZodError)return reply({error:e.issues[0]?.message||'Check the form.'},400);console.error('QA request failed',e instanceof Error?e.message:'Unknown');return reply({error:'Unable to complete the request.'},500)}
export async function GET(request:Request){try{return reply(await qaState(await context(request)))}catch(e){return fail(e)}}
export async function POST(request:Request){try{await checkOrigin(request);const input=await readJSON(request);const ctx=await context(request);await throttle(`qa:${ctx.me.id}`,180,60);const result=await qaAction(ctx,input,new URL(request.url).origin);return reply({ok:true,...result})}catch(e){return fail(e)}}
