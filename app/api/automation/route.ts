import {getChatGPTUser} from '../../chatgpt-auth';
import {AppError,identityWorkspace,one,postgresConnection,rows,uid} from '@/lib/server/store';
import {checkOrigin,readJSON,throttle} from '@/lib/server/auth';
import {manager,qaCaseAccess,qaReportAccess} from '@/lib/server/qa';
import {planSchema} from '@/lib/automation.mjs';
import {z,ZodError} from 'zod';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) =>
  Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new AppError(401,'Sign in to continue.');
    const url = new URL(request.url);
    const ctx = await identityWorkspace(user,url.searchParams.get('workspace') || undefined);
    const test = await qaCaseAccess(ctx,z.string().min(1).max(120).parse(url.searchParams.get('case')));
    const report = await qaReportAccess(ctx,test.reportId);
    if (test.kind !== 'test_case' || test.deleted) throw new AppError(404,'Test case unavailable.');
    const storage = postgresConnection() && await one<{ready: boolean}>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='relay_test_runs' AND column_name='live_preview') AS ready",
    );
    if (!storage || !storage.ready) return reply({error:'Apply Relay’s PostgreSQL automation migrations to enable test runs.'},503);
    const args = [ctx.workspace.id,test.id];
    if (request.method === 'GET') {
      const poll = url.searchParams.get('run');
      if (poll) {
        const run = await one('SELECT id,status,live_preview FROM relay_test_runs WHERE workspace_id=? AND case_id=? AND id=?',...args,z.string().uuid().parse(poll));
        if (!run) throw new AppError(404,'Run unavailable.');
        return reply(run);
      }
      const saved = await one<{plan:unknown}>('SELECT plan FROM relay_test_plans WHERE workspace_id=? AND case_id=?',...args);
      const runs = await rows('SELECT id,mode,status,created_at,started_at,finished_at,evidence FROM relay_test_runs WHERE workspace_id=? AND case_id=? ORDER BY created_at DESC LIMIT 15',...args);
      return reply({plan:saved?.plan ?? null,runs});
    }
    await checkOrigin(request);
    manager(ctx);
    if (report.archived) throw new AppError(409,'Restore this report before running tests.');
    await throttle('automation:'+ctx.me.id,20,60);
    const input = z.object({action:z.enum(['save','run','cancel']),plan:z.unknown().optional(),runId:z.string().uuid().optional(),mode:z.enum(['background','watch']).default('background')}).strict().parse(await readJSON(request));
    if (input.action === 'save') {
      const plan = planSchema.parse(input.plan);
      await one('INSERT INTO relay_test_plans(workspace_id,case_id,plan) VALUES(?,?,?) ON CONFLICT(case_id) DO UPDATE SET plan=excluded.plan RETURNING case_id',...args,JSON.stringify(plan));
      return reply({ok:true});
    }
    if (input.action === 'cancel') {
      const run = await one("UPDATE relay_test_runs SET status='cancelled',finished_at=now() WHERE workspace_id=? AND case_id=? AND id=? AND status='queued' RETURNING id",...args,input.runId);
      if (!run) throw new AppError(409,'Only queued runs can be cancelled.');
      return reply({ok:true});
    }
    const run = await one<{id:string}>("INSERT INTO relay_test_runs(id,requested_by,mode,workspace_id,case_id,plan,status) SELECT ?,?,?,workspace_id,case_id,plan,'queued' FROM relay_test_plans WHERE workspace_id=? AND case_id=? ON CONFLICT DO NOTHING RETURNING id",uid(),ctx.me.id,input.mode,...args);
    if (!run) throw new AppError(409,'Save a test plan first, or wait for the active run to finish.');
    return reply({ok:true,runId:run.id},202);
  } catch(error) {
    if (error instanceof AppError) return reply({error:error.message},error.status);
    if (error instanceof ZodError) return reply({error:error.issues[0]?.message},400);
    return reply({error:'Unable to access automated tests.'},500);
  }
}

export {handle as GET, handle as POST};
