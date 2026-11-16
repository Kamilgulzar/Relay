import {getChatGPTUser} from './chatgpt-auth';
import Landing from '../components/relay/landing';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;if(params.task||params.project||params.form){const query=new URLSearchParams();for(const k of ['task','project','form'])if(typeof params[k]==='string')query.set(k,params[k] as string);redirect(`/workspace?${query}`)}const user=await getChatGPTUser();return <Landing signedIn={!!user}/>}
