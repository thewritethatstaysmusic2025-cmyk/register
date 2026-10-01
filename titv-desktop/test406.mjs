import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
await fs.mkdir('qa/screenshots',{recursive:true});
function fixture(html){
 const m=/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);assert(m);
 let code=m[1],ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
 const boot=ast.body.find(n=>n.type==='ExpressionStatement'&&/^boot\(\)\.catch/.test(code.slice(n.start,n.end)));assert(boot);
 code=code.slice(0,boot.start)+'/* isolated QA bootstrap */'+code.slice(boot.end);
 code+=`\ncloudCfg={enabled:false,forceCloud:false,url:'',key:''};cloudBypass=true;supabase=null;cloudUser=null;currentOrg={id:'00000000-0000-0000-0000-000000000001'};currentMembership=null;viewerMode=false;
 currentWeek='2026-09-28';leaveWeek=currentWeek;currentView='leave';
 state={meta:{orgName:'測試工程部',systemName:'製播排班系統',logoDataUrl:DEFAULT_LOGO_DATA},employees:[{id:'QA1',name:'測試甲',roles:['CAM'],active:true,employeeNumber:'QA1',order:1},{id:'QA2',name:'測試乙',roles:['TD'],active:true,employeeNumber:'QA2',order:2}],events:[],leaves:[],templates:[],weeks:{[currentWeek]:{status:'draft',version:1,publishedAt:null}},audits:[]};
 bindUI();hideAuthGate();renderAll();setTextSafe('systemVersionText',SYSTEM_VERSION);window.__schedulerBootReady=true;document.getElementById('bootScreen')?.remove();
 window.__halfQA={open:openLeaveModal,read:readLeaveFormEntry,all:()=>JSON.parse(JSON.stringify(state.leaves)),load:l=>{state.leaves=l;renderAll();},map:mapLeaveRow,unmap:mapLeaveFromCloud,label:leaveDisplayLabel,conflicts:leaveConflictsWithEvent,usage:formatLeaveUsage,days:leaveFullDayCount,hours:leaveHours,half:leaveIsHalfDay,allows:leaveAllowsHalfDay,print:()=>buildSchedulePrintSvg(currentWeek),png:()=>buildScheduleImageExportSvg(currentWeek,{generatedAt:0}).svg,render:renderAll,normalize:normalizeBackupPayload};`;
 return html.slice(0,m.index)+m[0].replace(m[1],()=>code)+html.slice(m.index+m[0].length);
}
const pages={web:fixture(await fs.readFile('web-overlay/index.html','utf8')),desktop:fixture(await fs.readFile('app/index.html','utf8'))};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(pages[url.pathname.slice(1)]){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(pages[url.pathname.slice(1)]);}
 if(url.pathname.startsWith('/.netlify/functions/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"dates":{},"configured":false}');}
 const rel=decodeURIComponent(url.pathname).replace(/^\//,'');if(rel.includes('..')){res.writeHead(403);return res.end();}
 try{const buf=await fs.readFile(path.join('app',rel));res.writeHead(200,{'Content-Type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(rel)]||'application/octet-stream'});res.end(buf);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();const report={scope:'Synthetic local records only; no live account login, cloud writes, or notifications.',cases:[],passed:false};
try{
 for(const target of ['web','desktop']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(origin+'/'+target);await page.waitForFunction(()=>!!window.__halfQA);
  const entry={target};
  await page.evaluate(()=>window.__halfQA.open(null,{date:'2026-09-28',employeeId:'QA1'}));
  await page.selectOption('#leaveType','休O');await page.selectOption('#leaveUnit','half_day');
  assert(await page.locator('#leaveTimeSection').isVisible());
  const invalid=await page.evaluate(()=>{try{window.__halfQA.read();return false;}catch{return true;}});assert(invalid,'Missing half-day time must be rejected');
  await page.locator('#leaveStartTime').fill('09:00');await page.locator('#leaveEndTime').fill('13:00');
  await page.locator('#leaveForm button[type="submit"]').click();
  await page.waitForFunction(()=>window.__halfQA.all().length===1&&document.getElementById('leaveModal').getAttribute('aria-hidden')==='true');
  const saved=await page.evaluate(()=>window.__halfQA.all()[0]);assert.equal(saved.type,'休O');assert.equal(saved.meta.unit,'hour');assert.equal(saved.meta.duration,'half_day');assert.equal(saved.meta.day_fraction,0.5);assert.equal(saved.meta.start_time,'09:00');
  entry.savedMeta=saved.meta;
  const roundTrip=await page.evaluate(l=>window.__halfQA.unmap(JSON.parse(JSON.stringify(window.__halfQA.map(l)))),saved);assert.deepEqual(roundTrip,saved);entry.cloudDtoRoundTrip=true;
  await page.evaluate(id=>window.__halfQA.open(id),saved.id);assert.equal(await page.locator('#leaveUnit').inputValue(),'half_day');assert.equal(await page.locator('#leaveStartTime').inputValue(),'09:00');entry.reopenPassed=true;
  await page.screenshot({path:'qa/screenshots/halfday-'+target+'.png'});
  await page.locator('#leaveForm [data-close="leaveModal"]').click();
  const matrix=await page.evaluate(l=>{
   const q=window.__halfQA;
   return {label:q.label(l),during:q.conflicts(l,{date:l.date,start:'10:00',end:'11:00'}),before:q.conflicts(l,{date:l.date,start:'08:00',end:'09:00'}),after:q.conflicts(l,{date:l.date,start:'13:00',end:'14:00'}),overlap:q.conflicts(l,{date:l.date,start:'12:30',end:'14:00'}),days:q.days([l]),hours:q.hours([l]),usage:q.usage([l]),print:q.print(),png:q.png()};
  },saved);
  assert(matrix.during&&matrix.overlap);assert.equal(matrix.before,false);assert.equal(matrix.after,false);assert.equal(matrix.days,0.5);assert.equal(matrix.hours,0);assert.match(matrix.usage,/0.5/);assert.match(matrix.print,/半天/);assert.match(matrix.png,/半天/);assert.match(matrix.print,/09:00/);assert.match(matrix.png,/13:00/);
  entry.boundaryChecksPassed=true;entry.halfDayUsage=matrix.usage;entry.printAndPngLabels=true;
  for(const type of ['休O','休F','輪休','國定假日H','員旅','公假']){
   await page.evaluate(()=>window.__halfQA.open(null,{date:'2026-09-29',employeeId:'QA2'}));await page.selectOption('#leaveType',type);await page.selectOption('#leaveUnit','half_day');assert(await page.locator('#leaveTimeSection').isVisible());
  }
  await page.selectOption('#leaveType','值班');assert.equal(await page.locator('#leaveUnit').inputValue(),'day');assert.equal(await page.locator('#leaveTimeSection').isVisible(),false);
  await page.selectOption('#leaveType','加班H');assert.equal(await page.locator('#leaveUnit').inputValue(),'day');
  await page.selectOption('#leaveType','家庭照顧假');await page.selectOption('#leaveUnit','hour');assert(await page.locator('#leaveTimeSection').isVisible());entry.legacyHourlyPreserved=true;
  await page.locator('#leaveForm [data-close="leaveModal"]').click();
  await page.evaluate(id=>window.__halfQA.open(id),saved.id);await page.selectOption('#leaveUnit','day');await page.locator('#leaveForm button[type="submit"]').click();
  await page.waitForFunction(()=>window.__halfQA.all()[0]?.meta.unit==='day');
  const whole=await page.evaluate(()=>window.__halfQA.all()[0]);assert.equal(whole.meta.duration,undefined);assert.equal(whole.meta.start_time,'');assert.equal(await page.evaluate(l=>window.__halfQA.days([l]),whole),1);entry.wholeDayRestoredWithoutStaleMetadata=true;
  assert.deepEqual(errors,[]);entry.pageErrors=errors;report.cases.push(entry);await context.close();
 }
 report.passed=true;
}catch(e){report.failure=e.stack;throw e;}
finally{await fs.writeFile('qa/halfday-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
