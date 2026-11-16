import {setTimeout as pause} from 'node:timers/promises';
import pg from 'pg';
import {executePlan} from '../lib/automation-browser.mjs';

const connectionString = process.env.POSTGRES_URL;
const allowedOrigins = new Set((process.env.RELAY_AUTOMATION_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean));
const assetOrigins = new Set((process.env.RELAY_AUTOMATION_ASSET_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean));
const readApiOrigins = new Set((process.env.RELAY_AUTOMATION_READ_API_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean));
const browserChannel = process.env.RELAY_BROWSER_CHANNEL?.trim() || 'chromium';
const executablePath = process.env.RELAY_BROWSER_PATH;
if (!['chromium','msedge','chrome'].includes(browserChannel)) throw new Error('RELAY_BROWSER_CHANNEL must be chromium, msedge, or chrome.');
if (executablePath && process.env.RELAY_BROWSER_CHANNEL?.trim()) throw new Error('Set either RELAY_BROWSER_CHANNEL or RELAY_BROWSER_PATH.');
for (const origin of [...allowedOrigins,...assetOrigins,...readApiOrigins]) {
  const url = new URL(origin);
  if (url.origin!==origin || url.protocol!=='https:' || url.port) throw new Error('The runner allowlist requires exact HTTPS origins.');
}
if (!connectionString || !allowedOrigins.size) throw new Error('Set POSTGRES_URL and RELAY_AUTOMATION_ORIGINS before starting the runner.');
const pool = new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000,query_timeout:5000});
let stopping = false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{stopping=true;});

try {
  await pool.query('SELECT mode,live_preview FROM relay_test_runs LIMIT 0');
  console.log('Relay automation runner ready.');
  while (!stopping) {
    await pool.query(`UPDATE relay_test_runs SET status='blocked',finished_at=now(),live_preview=NULL,
      evidence='{"steps":[],"message":"Runner did not finish before its deadline."}'
      WHERE status='running' AND started_at < now()-interval '3 minutes'`);
    const {rows:[run]} = await pool.query(`
      WITH next_run AS (
        SELECT id FROM relay_test_runs WHERE status='queued' ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE relay_test_runs SET status='running',started_at=now()
      FROM next_run WHERE relay_test_runs.id=next_run.id
      RETURNING relay_test_runs.id,plan,case_id,workspace_id,requested_by,mode`);
    if (!run) {await pause(1500);continue;}
    let result;
    try {
      const {rowCount} = await pool.query(`
        SELECT 1 FROM records c
        JOIN records r ON r.id=c.data::jsonb->>'reportId' AND r.workspace_id=c.workspace_id AND r.kind='qa_report'
        JOIN members m ON m.workspace_id=c.workspace_id AND m.id=$3 AND m.role IN ('admin','qa')
        JOIN accounts a ON a.id=m.user_id AND a.disabled=0
        WHERE c.id=$1 AND c.workspace_id=$2 AND c.kind='qa_case'
          AND c.data::jsonb->>'kind'='test_case'
          AND c.data::jsonb->>'deleted' IS DISTINCT FROM 'true'
          AND r.data::jsonb->>'archived' IS DISTINCT FROM 'true'`,[run.case_id,run.workspace_id,run.requested_by]);
      const watch = run.mode==='watch';
      const publish = async frame => {
        await pool.query("UPDATE relay_test_runs SET live_preview=$1 WHERE id=$2 AND status='running'",[JSON.stringify(frame),run.id]);
      };
      result = rowCount ? await executePlan(run.plan,{
        allowedOrigins,assetOrigins,readApiOrigins,executablePath,browserChannel,
        headed:watch && process.env.RELAY_AUTOMATION_HEADED==='1',
        onFrame:watch ? publish : undefined,
      }) :
        {status:'blocked',evidence:{steps:[],message:'The test case or requesting account is no longer eligible to run.'}};
    } catch {
      result = {status:'blocked',evidence:{steps:[],message:'The runner could not initialize this test.'}};
    }
    await pool.query(`UPDATE relay_test_runs SET status=$1,evidence=$2,finished_at=now(),live_preview=NULL
      WHERE id=$3 AND status='running'`,[result.status,JSON.stringify(result.evidence),run.id]);
    console.log('Run '+run.id+' '+result.status);
    if (process.argv.includes('--once')) break;
  }
} finally {
  await pool.end();
}
