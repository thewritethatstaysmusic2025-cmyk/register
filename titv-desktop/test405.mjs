import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
await fs.mkdir('qa/screenshots',{recursive:true});
function fixtureHTML(html){
  const m=/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);assert(m);
  let code=m[1];const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const boot=ast.body.find(n=>n.type==='ExpressionStatement'&&/^boot\(\)\.catch/.test(code.slice(n.start,n.end)));assert(boot,'No matching boot entry');
  code=code.slice(0,boot.start)+'/* QA copy only: normal cloud bootstrap omitted. */'+code.slice(boot.end);
  code+=`\n// This hook is inserted only into ephemeral QA pages, NEVER the shipped app.\n
cloudCfg={enabled:false,forceCloud:false,url:'',key:''};cloudBypass=true;supabase=null;cloudUser=null;currentOrg=null;currentMembership=null;viewerMode=false;
currentWeek='2026-09-28';leaveWeek=currentWeek;currentView='dashboard';
const qaEmployee=(id,name,roles)=>({id,name,employeeNumber:id,email:'',hireDate:'2024-01-01',roles,active:true,order:1,note:'',notifyPublish:false,notifyChange:false,notifyEmergency:false,notifyCancel:false});
state={meta:{orgName:'測試工程部',systemName:'製播排班系統',logoDataUrl:DEFAULT_LOGO_DATA},employees:[qaEmployee('QA1','測試甲',['CAM','VE']),qaEmployee('QA2','測試乙',['TD','AE'])],events:[{id:'qa-event-1',date:currentWeek,start:'09:00',end:'10:00',title:'介面測試勤務',type:'news',location:'測試棚',notes:'',status:'draft',color:defaultEventColor('news'),required:{PD:0,AD:0,TD:1,CAM:1,VE:0,AE:0},assignments:{PD:[],AD:[],TD:['QA2'],CAM:['QA1'],VE:[],AE:[]},updatedAt:'2026-09-28T00:00:00Z'}],leaves:[],templates:[],weeks:{[currentWeek]:{status:'draft',version:1,publishedAt:null}},audits:[]};
bindUI();hideAuthGate();renderAll();setTextSafe('systemVersionText',SYSTEM_VERSION);window.__schedulerBootReady=true;document.getElementById('bootScreen')?.remove();
window.__qa={render:renderAll,view:setView,bind:bindUI,icons:()=>typeof syncUiIcons==='function'?syncUiIcons():0,print:renderPrintSchedule,image:()=>buildScheduleImageExportSvg(currentWeek,{generatedAt:0}),assignment:()=>buildAssignmentInputs(state.events[0]),menu:setMobileSidebar};
`;
  return html.slice(0,m.index)+m[0].replace(m[1],code)+html.slice(m.index+m[0].length);
}
const pages={original:fixtureHTML(await fs.readFile('qa/original.html','utf8')),fixed:fixtureHTML(await fs.readFile('app/index.html','utf8'))};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/original'||url.pathname==='/fixed'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(pages[url.pathname.slice(1)]);return;}
  if(url.pathname.startsWith('/.netlify/functions/')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({dates:{},configured:false,connected:false}));return;}
  const rel=decodeURIComponent(url.pathname).replace(/^\//,'');
  if(rel.includes('..')){res.writeHead(403);res.end();return;}
  try{const data=await fs.readFile(path.join('app',rel));const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};res.writeHead(200,{'Content-Type':types[path.extname(rel)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();const report={scope:'Local fixture data only; no live login, no production writes, no LINE/email sent.',cases:[],limits:['Live signed-in Realtime notifications and user-device installation were not tested.']};
let originalImage;
try{
for(const name of ['original','fixed']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const external=[];
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin)||url.startsWith('data:'))return route.continue();external.push(new URL(url).hostname);return route.abort();});
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(origin+'/'+name);await page.waitForFunction(()=>Boolean(window.__qa),null,{timeout:20000});
  const count=()=>page.evaluate(()=>({icons:document.querySelectorAll('svg.tribal-icon').length,slots:document.querySelectorAll('[data-titv-icon]').length,styles:document.querySelectorAll('style').length,duplicateSlots:[...document.querySelectorAll('[data-titv-icon]')].filter(x=>x.querySelectorAll(':scope > svg').length!==1).length,sprites:document.querySelectorAll('.ui-icon-sprite').length}));
  const before=await count();
  for(let i=0;i<20;i++){
    for(const v of ['schedule','staff','leave','templates','compliance','audit','settings','dashboard'])await page.locator('.side-nav button[data-view="'+v+'"]').click();
  }
  await page.evaluate(()=>{for(let i=0;i<100;i++)window.__qa.render();});
  for(let i=0;i<10;i++){await page.locator('.side-nav button[data-view="schedule"]').hover();await page.locator('.side-nav button[data-view="dashboard"]').hover();}
  const after=await count();assert.equal(after.icons,before.icons,name+' icons grew');assert.equal(after.styles,before.styles,name+' styles grew');assert.equal(after.sprites,1);
  await page.screenshot({path:'qa/screenshots/'+name+'-desktop.png'});
  const image=await page.evaluate(()=>window.__qa.image());
  assert(image.startsWith('<svg'));if(name==='original')originalImage=image;else assert.equal(image,originalImage,'PNG export source changed for same fixture');
  const entry={name,before,after,navigationClicks:160,fullRenders:100,hoverCycles:10,pageErrors:errors,imageExportSha256:sha(image)};
  if(name==='fixed'){
    assert.equal(after.slots,48);assert.equal(after.duplicateSlots,0);
    await page.evaluate(()=>{for(let i=0;i<20;i++)window.__qa.bind();});
    await page.locator('.side-nav button[data-view="schedule"]').click();
    assert.equal(await page.locator('#quickAddBtn .titv-action-label').textContent(),'新增工作');
    const repaired=await page.evaluate(()=>{const slot=document.querySelector('[data-titv-icon]');slot.appendChild(slot.firstElementChild.cloneNode(true));const changed=window.__qa.icons();return {changed,children:slot.children.length};});
    assert.equal(repaired.children,1);assert.equal(repaired.changed,1);entry.injectedDuplicateRecovered=true;
    const mutations=await page.evaluate(async()=>{let n=0;const observer=new MutationObserver(xs=>n+=xs.length);observer.observe(document.querySelector('#appShell'),{childList:true,subtree:true,attributes:true});for(let i=0;i<100;i++)window.__qa.icons();await Promise.resolve();observer.disconnect();return n;});
    assert.equal(mutations,0);entry.repeatMountMutations=mutations;
    const conflict=await page.addStyleTag({content:'svg {position:absolute!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:999px!important;flex-shrink:1!important;}'});
    const bad=await page.locator('.titv-icon-slot > svg').evaluateAll(xs=>xs.filter(el=>{const s=getComputedStyle(el);return s.position!=='relative'||s.transform!=='none'||Number.parseFloat(s.width)>24||s.flexShrink!=='0';}).length);
    assert.equal(bad,0);await conflict.evaluate(el=>el.remove());entry.globalSVGConflictResisted=true;
    await page.evaluate(()=>{window.__qa.print();window.__qa.print();window.__qa.assignment();window.__qa.assignment();});
    assert.equal(await page.locator('#printSchedule > .print-single-sheet > svg').count(),1);
    entry.printSvgCount=1;
    for(const width of [960,1280,1440,1920]){
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.__qa.view('dashboard'));await page.waitForTimeout(100);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,'Desktop overflow at '+width);
    }
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.__qa.view('dashboard');window.__qa.menu(true);});await page.waitForTimeout(300);
    const menu=await page.locator('#sidebar').boundingBox();assert(menu&&menu.x>=-2&&menu.x<2,'Mobile menu did not open');
    await page.evaluate(()=>window.__qa.menu(false));await page.waitForTimeout(300);await page.screenshot({path:'qa/screenshots/fixed-mobile.png'});entry.mobileMenuPassed=true;
  }
  assert.deepEqual(errors,[],name+' runtime JS errors');report.cases.push(entry);await context.close();
}
report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;throw error;}
finally{await fs.writeFile('qa/test-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
