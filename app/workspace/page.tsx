import {getChatGPTUser} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
import RelayApp from '../../components/relay/app';
export const dynamic='force-dynamic';
export default async function Workspace(){const user=await getChatGPTUser();if(!user)redirect('/login');return <RelayApp signedIn={true}/>}
