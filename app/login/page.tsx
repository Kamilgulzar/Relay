import Login from '../../components/relay/login';
import {getSessionAccount} from '@/lib/server/auth';
import {redirect} from 'next/navigation';
export const metadata={title:'Sign in — Relay',referrer:'no-referrer' as const};
export const dynamic='force-dynamic';
export default async function LoginPage({searchParams}:{searchParams:Promise<{token?:string}>}){const params=await searchParams;if(await getSessionAccount()&&!params.token)redirect('/qa');return <Login token={params.token||''}/>}
