import {cookies} from 'next/headers';
import {scrypt,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
const bytesToHex=(v:Uint8Array)=>Buffer.from(v).toString('hex');
const hexToBytes=(v:string)=>Buffer.from(v,'hex');
const derive=(password:string,salt:Uint8Array)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
import {one,write,database,AppError,resolveWorkspaceContext} from './store';
const SESSION_COOKIE='relay_session';
const lifetime=7*24*60*60;
export type Account={id:string;email:string;name:string;password_hash:string;disabled:number};
export async function digest(value:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
export function secret(){return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}
function validatePassword(password:unknown):asserts password is string{if(typeof password!=='string'||password.length<12||password.length>128)throw new AppError(400,'Use a password between 12 and 128 characters.');}
export async function hashPassword(password:string){validatePassword(password);const salt=secret().slice(0,32);const result=await derive(password,hexToBytes(salt));return `scrypt$32768$8$3$${salt}$${bytesToHex(result)}`}
export async function verifyPassword(password:string,stored:string){const parts=stored.split('$');if(parts.length!==6||parts[0]!=='scrypt')return false;const result=await derive(password,hexToBytes(parts[4]));const expected=hexToBytes(parts[5]);return result.length===expected.length&&timingSafeEqual(result,expected)}
export async function getSessionAccount(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  return one<Account>(
    'SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.hash=? AND s.expires_at>? AND a.disabled=0',
    await digest(token),
    Date.now(),
  );
}

export async function requireRequestWorkspace(request:Request, signInMessage='Sign in to continue.') {
  const account=await getSessionAccount();
  if(!account)throw new AppError(401,signInMessage);

  const workspaceId=new URL(request.url).searchParams.get('workspace');
  return resolveWorkspaceContext(account,workspaceId||undefined);
}
export async function issueSession(accountId:string,request:Request){const token=secret();await write('DELETE FROM sessions WHERE expires_at<?',Date.now());await write('INSERT INTO sessions(hash,account_id,expires_at) VALUES(?,?,?)',await digest(token),accountId,Date.now()+lifetime*1000);return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${lifetime}${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export function clearCookie(request:Request){return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export async function revokeCurrent(){const token=(await cookies()).get(SESSION_COOKIE)?.value;if(token)await write('DELETE FROM sessions WHERE hash=?',await digest(token))}
export async function throttle(key:string,limit:number,seconds:number){const stamp=Date.now();await write('DELETE FROM auth_throttle WHERE expires_at<?',stamp);const row=await database().prepare('INSERT INTO auth_throttle(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_throttle.expires_at<? THEN 1 ELSE auth_throttle.attempts+1 END,expires_at=CASE WHEN auth_throttle.expires_at<? THEN excluded.expires_at ELSE auth_throttle.expires_at END RETURNING attempts').bind(await digest(key),stamp+seconds*1000,stamp,stamp).first<{attempts:number}>();if(!row||row.attempts>limit)throw new AppError(429,'Too many attempts. Please wait and try again.');}
export async function checkOrigin(request:Request){
 if(request.headers.get('origin')===new URL(request.url).origin)return;
 // Finish a small rejected body before returning. The local Worker proxy can
 // otherwise cancel the next request when an unread POST body is abandoned.
 await discardBody(request);
 throw new AppError(403,'Reload this page before submitting.');
}
export async function readJsonBody(request:Request,maxBytes=100000):Promise<unknown>{if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError(415,'JSON is required.');if(Number(request.headers.get('content-length')||0)>maxBytes)throw new AppError(413,'Request is too large.');const reader=request.body?.getReader();if(!reader)throw new AppError(400,'Request is empty.');let size=0;const parts:Uint8Array[]=[];for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>maxBytes){await reader.cancel();throw new AppError(413,'Request is too large.')}parts.push(item.value)}const buffer=new Uint8Array(size);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length}try{return JSON.parse(new TextDecoder().decode(buffer))}catch{throw new AppError(400,'Invalid request.')}}
export async function setupAvailable(){return !await one('SELECT key FROM auth_settings WHERE key=?','initial_admin')}

export async function discardBody(request:Request){
 if(!request.body||request.bodyUsed)return;
 try{const reader=request.body.getReader();let total=0;for(;;){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>100000){await reader.cancel();break}}}catch{/* The body may have been cancelled by the client. */}
}
