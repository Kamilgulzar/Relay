import {getChatGPTUser} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
import QualityApp from '../../components/relay/quality';
export const dynamic='force-dynamic';
export default async function QualityPage(){if(!await getChatGPTUser())redirect('/login');return <QualityApp/>}
