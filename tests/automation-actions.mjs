import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {performStep} from '../lib/automation-browser.mjs';
import {operations,planSchema} from '../lib/automation.mjs';

const origin = 'https://relay-fixture.test';
const browser = await chromium.launch({executablePath:process.env.RELAY_BROWSER_PATH});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(2500);
  await page.route(origin+'/**',route=>route.fulfill({
    contentType:'text/html',body:`
      <title>Relay test fixture</title>
      <form onsubmit="event.preventDefault();document.querySelector('#result').textContent='Submitted'">
        <input id="name"><input id="subscribe" type="checkbox">
        <select id="country"><option value="us">United States</option><option value="pk">Pakistan</option></select>
        <button id="submit">Submit</button><button id="unavailable" disabled>Unavailable</button>
      </form>
      <div id="result"></div>
      <button id="hover" onmouseenter="this.dataset.state='hovered'">Hover target</button>
      <button id="double" ondblclick="this.hidden=true">Double-click target</button>
      <div id="source" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', 'card')">Card</div>
      <div id="destination" ondragover="event.preventDefault()" ondrop="event.preventDefault();this.textContent=event.dataTransfer.getData('text/plain')+' moved'">Destination</div>
      <ul><li>One</li><li>Two</li></ul>
      <div style="height:1500px"></div><a id="next" href="/next">Next page</a>`,
  }));
  const steps = [
    {action:'open',value:'/'},{action:'title',value:'Relay test'},
    {action:'fill',target:'#name',value:'Amina'},{action:'value',target:'#name',value:'Amina'},
    {action:'select',target:'#country',value:'pk'},{action:'value',target:'#country',value:'pk'},
    {action:'check',target:'#subscribe'},{action:'checked',target:'#subscribe'},
    {action:'uncheck',target:'#subscribe'},{action:'unchecked',target:'#subscribe'},
    {action:'enabled',target:'#submit'},{action:'disabled',target:'#unavailable'},
    {action:'focus',target:'#name'},{action:'press',target:'#name',value:'Enter'},
    {action:'text',target:'#result',value:'Submitted'},
    {action:'hover',target:'#hover'},{action:'attribute',target:'#hover',name:'data-state',value:'hovered'},
    {action:'doubleClick',target:'#double'},{action:'hidden',target:'#double'},
    {action:'drag',target:'#source',value:'#destination'},{action:'text',target:'#destination',value:'card moved'},
    {action:'count',target:'li',value:'2'},{action:'visible',target:'ul'},
    {action:'scroll',target:'#next'},{action:'click',target:'#next'},{action:'url',value:'/next'},
    {action:'back'},{action:'url',value:'test/'},
    {action:'forward'},{action:'url',value:'/next'},{action:'reload'},
  ];
  const plan = planSchema.parse({origin,viewport:'desktop',steps});
  assert.deepEqual(new Set(plan.steps.map(step=>step.action)),new Set(Object.keys(operations)));
  for (const step of plan.steps) await performStep(page,step,origin);
  assert.equal(planSchema.safeParse({...plan,steps:[steps[0],{action:'count',target:'li',value:'-1'}]}).success,false);
  assert.equal(planSchema.safeParse({...plan,steps:[steps[0],{action:'drag',target:'#source'}]}).success,false);
  // The original plan shape remains valid.
  assert.equal(planSchema.safeParse({...plan,steps:[steps[0],{action:'visible',target:'ul'}]}).success,true);
  console.log(`Verified all ${Object.keys(operations).length} Relay actions in Chromium.`);
} finally {
  await browser.close();
}
