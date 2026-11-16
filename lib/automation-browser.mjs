import {lookup} from 'node:dns/promises';
import {createServer} from 'node:http';
import {connect, isIPv4} from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {assertions, planSchema} from './automation.mjs';

function publicIPv4(address) {
  if (!isIPv4(address)) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 ||
    (a===100 && b>=64 && b<=127) || (a===169 && b===254) ||
    (a===172 && b>=16 && b<=31) || (a===192 && [0,168].includes(b)) ||
    (a===192 && b===88 && c===99) || (a===198 && [18,19].includes(b)) ||
    (a===198 && b===51 && c===100) || (a===203 && b===0 && c===113));
}

// CONNECT is the only accepted request. Connect to the validated IP directly so
// a later DNS answer cannot redirect Chromium to a local or private address.
async function startProxy(origins) {
  const authorities = new Set([...origins].map(origin => new URL(origin).hostname + ':443'));
  const sockets = new Set();
  const track = socket => {
    sockets.add(socket);
    socket.once('close',() => sockets.delete(socket));
  };
  const server = createServer((_request,response) => response.writeHead(403).end());
  server.on('connection',track);
  server.on('connect',async (request,client,head) => {
    client.on('error',() => client.destroy());
    if (!authorities.has(request.url)) return client.destroy();
    try {
      const addresses = await lookup(request.url.slice(0,-4),{family:4,all:true});
      if (client.destroyed || !addresses.length || addresses.some(item => !publicIPv4(item.address))) return client.destroy();
      const remote = connect({host:addresses[0].address,port:443,timeout:8000});
      track(remote);
      remote.once('connect',() => {
        remote.setTimeout(0);
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        client.pipe(remote).pipe(client);
      });
      remote.on('timeout',() => remote.destroy());
      remote.on('error',() => client.destroy());
      remote.on('close',() => client.destroy());
      client.on('close',() => remote.destroy());
    } catch {
      client.destroy();
    }
  });
  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {
    address:'http://127.0.0.1:'+server.address().port,
    close() {for (const socket of sockets) socket.destroy(); server.close();},
  };
}

async function expectEventually(check) {
  const deadline = Date.now()+7000;
  do {
    try {if (await check()) return;} catch(error) {
      if (error?.name !== 'TimeoutError') throw error;
    }
    await pause(150);
  } while (Date.now()<deadline);
  throw new Error('Assertion timed out.');
}

export async function performStep(page,step,origin) {
  const locator = step.target ? page.locator(step.target) : null;
  const navigation = {waitUntil:'domcontentloaded'};
  switch(step.action) {
    case 'open': {
      const destination = new URL(step.value,origin);
      if (destination.origin !== origin) throw new Error('Navigation left the target origin.');
      return page.goto(destination.href,navigation);
    }
    case 'reload': return page.reload(navigation);
    case 'back': return page.goBack(navigation);
    case 'forward': return page.goForward(navigation);
    case 'click': await locator.click(); break;
    case 'doubleClick': await locator.dblclick(); break;
    case 'fill': await locator.fill(step.value); break;
    case 'press': await locator.press(step.value); break;
    case 'hover': await locator.hover(); break;
    case 'focus': await locator.focus(); break;
    case 'scroll': await locator.scrollIntoViewIfNeeded(); break;
    case 'select': await locator.selectOption({value:step.value}); break;
    case 'check': await locator.check(); break;
    case 'uncheck': await locator.uncheck(); break;
    case 'drag': await locator.dragTo(page.locator(step.value)); break;
    case 'visible': await locator.waitFor({state:'visible'}); break;
    case 'hidden': await locator.waitFor({state:'hidden'}); break;
    case 'text': await expectEventually(async () => (await locator.innerText({timeout:500})).includes(step.value)); break;
    case 'url': await expectEventually(() => page.url().includes(step.value)); break;
    case 'title': await expectEventually(async () => (await page.title()).includes(step.value)); break;
    case 'value': await expectEventually(async () => await locator.inputValue({timeout:500})===step.value); break;
    case 'checked': await expectEventually(() => locator.isChecked({timeout:500})); break;
    case 'unchecked': await expectEventually(async () => !await locator.isChecked({timeout:500})); break;
    case 'enabled': await expectEventually(() => locator.isEnabled({timeout:500})); break;
    case 'disabled': await expectEventually(() => locator.isDisabled({timeout:500})); break;
    case 'count': await expectEventually(async () => await locator.count()===Number(step.value)); break;
    case 'attribute': await expectEventually(async () => await locator.getAttribute(step.name,{timeout:500})===step.value); break;
    default: throw new Error('Unsupported automation action.');
  }
}

export async function executePlan(input,{allowedOrigins,assetOrigins=new Set(),readApiOrigins=new Set(),executablePath,browserChannel,runTimeout=135000,headed=false,onFrame=undefined}) {
  const plan = planSchema.parse(input);
  const steps = [];
  const evidence = {steps};
  if (!allowedOrigins.has(plan.origin)) return {status:'blocked',evidence:{steps,message:'The target origin is outside the runner allowlist.'}};
  const proxy = await startProxy(new Set([...allowedOrigins,...assetOrigins,...readApiOrigins]));
  let browser;
  let timer;
  let timedOut = false;
  let assertion = false;
  let targetUnavailable = false;
  let targetStatus;
  const blockedResourceOrigins = new Set();
  const networkIssues = new Map();
  let navigationStatus;
  function recordNetworkIssue(request,reason,status) {
    const {origin,protocol} = new URL(request.url());
    const resourceType = request.resourceType();
    if (protocol!=='https:' || !['document','script','stylesheet','xhr','fetch'].includes(resourceType)) return;
    const method = request.method();
    const key = JSON.stringify([origin, method, resourceType, reason, status]);
    if (networkIssues.size<24 && !networkIssues.has(key)) {
      networkIssues.set(key,{origin,method,resourceType,reason,...(status ? {status} : {})});
    }
  }
  let page;
  let frameTimer;
  let capture;
  let currentStep = null;
  function publishFrame() {
    if (!onFrame || !page || timedOut || capture) return capture;
    const step = currentStep;
    capture = (async () => {
      try {
        // Use test data only. Hide form values from shared preview frames.
        const image = await page.screenshot({type:'jpeg',quality:30,timeout:1500,
          mask:[page.locator('input, textarea, [contenteditable=true]')]});
        if (image.length <= 150000) await onFrame({image:image.toString('base64'),step});
      } catch {
        // Preview failures must not change the automated test outcome.
      } finally {capture=undefined;}
    })();
    return capture;
  }
  try {
    browser = await chromium.launch({
      executablePath,
      channel: executablePath ? undefined : (browserChannel ?? 'chromium'),
      headless:!headed, chromiumSandbox:true, timeout:15000,
      proxy:{server:proxy.address,bypass:'<-loopback>'},
      args:['--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    });
    timer = setTimeout(() => {timedOut=true; void browser.close().catch(() => {});},runTimeout);
    const mobile = plan.viewport==='mobile';
    const context = await browser.newContext({
      viewport:mobile ? {width:390,height:844} : {width:1440,height:900},
      isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',acceptDownloads:false,
    });
    context.setDefaultTimeout(7000);
    context.setDefaultNavigationTimeout(12000);
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (allowedOrigins.has(url.origin)) return route.continue();
      if (assetOrigins.has(url.origin) && request.method()==='GET' &&
          ['script','stylesheet','image','font'].includes(request.resourceType())) return route.continue();
      if (readApiOrigins.has(url.origin) && ['GET','OPTIONS'].includes(request.method()) &&
          ['xhr','fetch','other'].includes(request.resourceType())) return route.continue();
      if (url.protocol==='https:' && ['document','script','stylesheet','xhr','fetch'].includes(request.resourceType()) && blockedResourceOrigins.size<12) {
        blockedResourceOrigins.add(url.origin);
      }
      recordNetworkIssue(request,'allowlist');
      return route.abort();
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    page = await context.newPage();
    page.on('response', response => {
      const request = response.request();
      const status = response.status();
      if (status>=400) recordNetworkIssue(request,'http',status);
      if (request.isNavigationRequest()) {
        // A new iframe's first navigation can be reported before its frame exists.
        try {
          if (request.frame()===page.mainFrame()) navigationStatus = status;
        } catch {}
      }
    });
    if (onFrame) frameTimer=setInterval(()=>void publishFrame(),1000);
    for (const [index,step] of plan.steps.entries()) {
      currentStep={number:index+1,total:plan.steps.length,action:step.action};
      const outcome = {action:step.action,status:'running',durationMs:0};
      steps.push(outcome);
      const started = Date.now();
      assertion = assertions.has(step.action);
      try {
        const response = await performStep(page,step,plan.origin);
        if (navigationStatus>=400 || (response && response.status()>=400) || (step.action==='open' && !response)) {
          targetUnavailable = true;
          targetStatus = navigationStatus>=400 ? navigationStatus : response?.status();
          throw new Error('Target returned an unsuccessful HTTP response.');
        }
        outcome.status='passed';
      } catch(error) {
        outcome.status='failed';
        throw error;
      } finally {
        outcome.durationMs=Date.now()-started;
      }
      if (onFrame) {
        await publishFrame();
        await pause(1400);
        if (timedOut) throw new Error('Run timed out.');
      }
    }
    return {status:'passed',evidence};
  } catch {
    if (page && !timedOut && !plan.steps.some(step=>step.action==='fill')) {
      try {
        const screenshot = await page.screenshot({type:'jpeg',quality:45,timeout:2500});
        if (screenshot.byteLength <= 150000) evidence.screenshot = screenshot.toString('base64');
      } catch {}
    }
    if (navigationStatus>=400) {
      targetUnavailable = true;
      targetStatus = navigationStatus;
    }
    const failed = assertion && !timedOut && !targetUnavailable;
    const message = timedOut ? 'The run exceeded its time limit.' : failed ?
      'The browser did not observe the expected result.' : targetUnavailable ?
      (targetStatus ? `The target returned HTTP ${targetStatus}. The browser could not reach the feature under test.` : 'The target did not return a navigation response.') :
      page ? 'The browser could not complete this step. Check the target, network allowlist and selector.' :
      'The runner could not launch Chromium or open its test context. Check the browser installation and runner configuration.';
    return {status:failed?'failed':'blocked',evidence:{...evidence,message,
      ...(blockedResourceOrigins.size ? {blockedResourceOrigins:[...blockedResourceOrigins]} : {}),
      ...(networkIssues.size ? {networkIssues:[...networkIssues.values()]} : {}),
    }};
  } finally {
    clearTimeout(timer);
    clearInterval(frameTimer);
    await browser?.close().catch(() => {});
    await capture;
    proxy.close();
  }
}
