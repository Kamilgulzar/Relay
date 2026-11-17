import {getSessionAccount} from '@/lib/server/auth';
import {redirect} from 'next/navigation';
import QualityApp from '../../components/relay/quality';
export const dynamic='force-dynamic';
export default async function QualityPage() {
  const account = await getSessionAccount();
  if (!account) redirect('/login');

  return <QualityApp/>;
}
