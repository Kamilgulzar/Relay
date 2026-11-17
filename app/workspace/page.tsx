import {getSessionAccount} from '@/lib/server/auth';
import {redirect} from 'next/navigation';
import ProjectWorkspace from '../../components/relay/app';
export const dynamic='force-dynamic';
export default async function WorkspacePage() {
  const account = await getSessionAccount();
  if (!account) redirect('/login');

  return <ProjectWorkspace/>;
}
