import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,request as playwrightRequest} from 'playwright-core';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';

const base = process.env.RELAY_TEST_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base || '')) throw new Error('Use an isolated loopback test app.');
const configuration = await fetch(base+'/api/auth').then(r=>r.json());
assert.equal(configuration.setup,true,'Requires a fresh isolated Relay database.');
let cookie;
const api = await playwrightRequest.newContext({baseURL:base,extraHTTPHeaders:{Origin:base}});
async function request(route,method='GET',data,status=200) {
  const response = await api.fetch(route,{method,data,timeout:15000});
  const body = await response.json();
  assert.equal(response.status(),status,JSON.stringify(body));
  if (response.headers()['set-cookie']) cookie=response.headers()['set-cookie'].split(';')[0];
  return body;
}
await request('/api/auth','POST',{
  action:'setup',name:'Automation QA',email:'automation@example.test',password:randomUUID(),workspaceName:'Automation verification',
});
const state = await request('/api/qa');
const report = await request('/api/qa','POST',{action:'report.save',data:{title:'Browser automation check'}});
const test = await request('/api/qa','POST',{action:'case.save',data:{
  reportId:report.id,kind:'test_case',title:'Documentation loads',steps:'Open the documentation.',
  expected:'Installation heading appears.',assigneeId:state.me.id,severity:'low',
}});
const endpoint = '/api/automation?'+new URLSearchParams({workspace:state.workspace.id,case:test.id});
const plan = {origin:'https://playwright.dev',viewport:'desktop',steps:[
  {action:'open',value:'/docs/intro'},{action:'visible',target:'main h1'},
]};
await request(endpoint,'POST',{action:'save',plan});
await request(endpoint,'POST',{action:'run'},202);
await request(endpoint,'POST',{action:'run'},409);
const queued = await request(endpoint);
assert.equal(queued.runs[0].status,'queued');
await request(endpoint,'POST',{action:'cancel',runId:queued.runs[0].id});
const {runId} = await request(endpoint,'POST',{action:'run',mode:'watch'},202);
const worker = spawn(process.execPath,['scripts/automation-runner.mjs','--once'],{stdio:'inherit'});
const timer = setTimeout(()=>worker.kill(),110000);
let receivedPreview = false;
const exited = once(worker,'exit');
try {
  for (let attempt=0;attempt<100;attempt++) {
    const update = await request(endpoint+'&run='+runId);
    if (update.live_preview?.image) {
      assert.equal(Buffer.from(update.live_preview.image,'base64').readUInt16BE(0),0xffd8);
      receivedPreview = true;
    }
    if (!['queued','running'].includes(update.status)) break;
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  const [exitCode] = await exited;assert.equal(exitCode,0);
} finally {clearTimeout(timer);}
assert.equal(receivedPreview,true,'The running browser published a live JPEG.');
assert.equal((await request(endpoint+'&run='+runId)).live_preview,null);
const completed = await request(endpoint);
assert.equal(completed.runs[0].status,'passed',JSON.stringify(completed.runs[0].evidence?.steps));
assert.equal(completed.runs[0].mode,'watch');
assert.equal(completed.runs[1].mode,'background');
assert.deepEqual(completed.runs[0].evidence.steps.map(step=>step.status),['passed','passed']);
assert.equal(completed.runs[1].status,'cancelled');
const background = await request(endpoint,'POST',{action:'run',mode:'background'},202);
const backgroundWorker = spawn(process.execPath,['scripts/automation-runner.mjs','--once'],{stdio:'inherit'});
const backgroundTimer = setTimeout(()=>backgroundWorker.kill(),110000);
try {
  const [exitCode] = await once(backgroundWorker,'exit');
  assert.equal(exitCode,0);
} finally {clearTimeout(backgroundTimer);}
const backgroundResult = await request(endpoint+'&run='+background.runId);
assert.equal(backgroundResult.status,'passed');
assert.equal(backgroundResult.live_preview,null);
assert.equal((await request('/api/qa')).cases.find(x=>x.id===test.id).result,'not_run');

const browser = await chromium.launch({executablePath:process.env.RELAY_BROWSER_PATH});
try {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:cookie.split('=')[0],value:cookie.split('=')[1],url:base}]);
  const page = await context.newPage();
  await page.goto(base+'/qa?case='+test.id);
  const panel = page.getByRole('region',{name:'Automated testing'});
  await panel.getByRole('button',{name:'Run in background',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Run and watch',exact:true}).waitFor();
  await panel.getByText('Passed',{exact:true}).first().waitFor();
  assert.equal(await panel.getByText('Passed',{exact:true}).count(),2);
  await panel.getByText('Cancelled',{exact:true}).waitFor();
  await panel.screenshot({path:'outputs/automation-panel.png'});
} finally {await browser.close();}
await api.dispose();
console.log('Automation verified: save, queue both modes, cancel, watch live frames, clear frames and preserve the manual result.');
