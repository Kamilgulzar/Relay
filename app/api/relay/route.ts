import {checkOrigin,readJSON} from '../../../lib/server/auth';
import {getChatGPTUser} from '../../chatgpt-auth';
import {identityWorkspace,state,AppError} from '../../../lib/server/store';
import {perform} from '../../../lib/server/actions';
import {ZodError} from 'zod';
import {DomainValidationError} from '../../../lib/validation';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function errorResponse(error:unknown){if(error instanceof AppError)return reply({error:error.message},error.status);if(error instanceof DomainValidationError)return reply({error:error.message},400);if(error instanceof ZodError)return reply({error:error.issues[0]?.message||'Check your input.'},400);console.error('Relay request failed',error instanceof Error?error.message:'Unknown error');return reply({error:'The request could not be completed. Please try again.'},500)}
export async function GET(request:Request){try{const user=await getChatGPTUser();if(!user)return reply({error:'Sign in to open your workspace.'},401);const url=new URL(request.url);const ctx=await identityWorkspace(user,url.searchParams.get('workspace')||undefined);return reply(await state(ctx))}catch(error){return errorResponse(error)}}
export async function POST(request:Request){try{await checkOrigin(request);const input=await readJSON(request);const user=await getChatGPTUser();if(!user)return reply({error:'Sign in to continue.'},401);const url=new URL(request.url);const ctx=await identityWorkspace(user,url.searchParams.get('workspace')||undefined);return reply({ok:true,...await perform(ctx,input)})}catch(error){return errorResponse(error)}}
