import './prepare405.mjs';
import fs from 'node:fs/promises';
import {parse} from 'acorn';
import {moduleRange,replaceFunction,hash} from './prepare405.mjs';
const WEB='https://titv-engineering-scheduler.netlify.app';
let html=await fs.readFile('web-overlay/index.html','utf8');
const range=moduleRange(html);let code=range.code;
function once(text,find,repl,label){const n=typeof find==='string'?text.split(find).length-1:[...text.matchAll(new RegExp(find.source,find.flags.includes('g')?find.flags:find.flags+'g'))].length;if(n!==1)throw Error(label+': expected one match, got '+n);return text.replace(find,()=>repl);}
const helpers=`
// Half-day is an approved duration, not a renamed leave type or a fixed four-hour rule.
function leaveAllowsHalfDay(type){return ['休O','休F','輪休','國定假日H','員旅','公假'].includes(canonicalLeaveType(type));}
function leaveIsHalfDay(l){const m=leaveMeta(l);return m.duration==='half_day'||m.unit==='half_day';}
function leaveScheduleLabel(l){if(!leaveIsHalfDay(l))return canonicalLeaveType(l?.type);const r=leaveHourRange(l);return [canonicalLeaveType(l.type),'半天',r.start&&r.end?r.start+'–'+r.end:'時段未填'].join(' · ');}
function leaveBadgeLabel(l){return canonicalLeaveType(l?.type)+(leaveIsHalfDay(l)?' · 半天':'');}
function validateLeaveEntry(l){
  if(!l?.employeeId||!/^\\d{4}-\\d{2}-\\d{2}$/.test(l.date||''))throw Error('請選擇人員與日期。');
  if(leaveIsHalfDay(l)&&!leaveAllowsHalfDay(l.type))throw Error('此假別不提供台內半天選項。');
  if(leaveIsHourly(l)){const r=leaveHourRange(l);if(!r.start||!r.end||minutes(r.end)<=minutes(r.start))throw Error('請填寫同一天的實際休假起訖時間，結束需晚於開始。');}
}
function mapLeaveFromCloud(row,previous=null){
  const raw=Object.prototype.hasOwnProperty.call(row,'leave_meta')?row.leave_meta:leaveMeta(previous);
  const meta=raw&&typeof raw==='object'&&!Array.isArray(raw)?JSON.parse(JSON.stringify(raw)):{};
  return {id:row.id,employeeId:row.employee_id,date:row.work_date,type:canonicalLeaveType(row.leave_type),note:row.note||'',meta};
}
function readLeaveFormEntry(){
  const type=canonicalLeaveType($('leaveType').value),chosen=$('leaveUnit').value;
  const half=chosen==='half_day'&&leaveAllowsHalfDay(type),hour=chosen==='hour'&&leaveAllowsHourly(type);
  if(chosen==='half_day'&&!half)throw Error('此假別不提供半天選項。');
  let start='',end='';if(half||hour){start=normalizeTime24($('leaveStartTime').value);end=normalizeTime24($('leaveEndTime').value);}
  const existing=state.leaves.find(x=>x.id===$('leaveId').value);
  const meta={...leaveMeta(existing),unit:half||hour?'hour':'day',detail:$('leaveDetailWrap').classList.contains('hidden')?'':$('leaveDetail').value,start_time:start,end_time:end};
  delete meta.duration;delete meta.day_fraction;
  if(half){meta.duration='half_day';meta.day_fraction=0.5;}
  const leave={id:$('leaveId').value||uuid(),date:$('leaveDate').value,employeeId:$('leaveEmployee').value,type,note:$('leaveNote').value.trim(),meta};
  validateLeaveEntry(leave);return leave;
}
`;
code=helpers+'\n'+code;
code=once(code,"const SYSTEM_VERSION='V3.33.8';","const SYSTEM_VERSION='V3.33.9';",'version');
code=replaceFunction(code,'leaveIsHourly',()=>"function leaveIsHourly(l){return leaveMeta(l).unit==='hour'||leaveIsHalfDay(l);}");
code=replaceFunction(code,'leaveDisplayLabel',()=>`function leaveDisplayLabel(l){
  if(!l)return '';const m=leaveMeta(l),parts=[canonicalLeaveType(l.type)];
  if(m.detail)parts.push(m.detail);if(leaveIsHalfDay(l))parts.push('半天');
  if(leaveIsHourly(l)){const r=leaveHourRange(l);parts.push(r.start&&r.end?r.start+'–'+r.end:'時段未填');}
  return parts.join('｜');
}`);
code=replaceFunction(code,'leaveFullDayCount',()=>"function leaveFullDayCount(rows=[]){return rows.reduce((n,l)=>n+(leaveIsHalfDay(l)?0.5:leaveIsHourly(l)?0:1),0);}");
code=replaceFunction(code,'leaveHours',()=>"function leaveHours(rows=[]){return rows.filter(l=>leaveIsHourly(l)&&!leaveIsHalfDay(l)).reduce((sum,l)=>{const r=leaveHourRange(l);return sum+(r.start&&r.end?Math.max(0,minutes(r.end)-minutes(r.start))/60:0)},0);}");
code=replaceFunction(code,'syncLeaveModalRule',()=>`function syncLeaveModalRule(){
  const type=canonicalLeaveType($('leaveType')?.value||''),detail=$('leaveDetail'),unit=$('leaveUnit'),detailWrap=$('leaveDetailWrap'),unitWrap=$('leaveUnitWrap'),time=$('leaveTimeSection'),card=$('leaveRuleCard');if(!detail||!unit||!card)return;
  const old=detail.value,opts=leaveDetailOptions(type);detail.innerHTML=opts.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');if(opts.some(x=>x[0]===old))detail.value=old;detailWrap.classList.toggle('hidden',!opts.length);
  const half=leaveAllowsHalfDay(type),hour=leaveAllowsHourly(type);
  for(const option of unit.options){const enabled=option.value==='day'||(option.value==='half_day'&&half)||(option.value==='hour'&&hour);option.hidden=!enabled;option.disabled=!enabled;}
  if(![...unit.options].some(o=>o.value===unit.value&&!o.disabled))unit.value='day';
  unitWrap.classList.toggle('hidden',!half&&!hour);unit.disabled=!half&&!hour;
  const timed=unit.value==='hour'||unit.value==='half_day';time.classList.toggle('hidden',!timed);
  for(const id of ['leaveStartTime','leaveEndTime']){const input=$(id);input.required=timed;input.disabled=!timed;}
  const p=leavePolicy(type);
  if(p)card.innerHTML='<strong>'+esc(p.label)+' <span class="legal-tag">'+esc(p.group)+'</span></strong><p>'+esc(p.limit)+'｜'+esc(p.pay)+'</p><p>'+esc(p.basis)+'</p><p>'+esc(p.summary)+'</p>';
  else card.innerHTML='<strong>'+esc(type||'TITV 台內狀態')+'</strong><p>休O、休F、輪休等台內假別維持原有定義；可依核准內容記錄整日或半天。</p>';
  if(unit.value==='half_day')card.innerHTML+='<p class="halfday-help">半天記錄為 0.5 日。請填寫實際休假起訖時間；不預設上午、下午或固定時數，只有重疊的勤務會產生休假衝突。</p>';
}`);
code=replaceFunction(code,'openLeaveModal',fn=>fn.replace("$('leaveUnit').value=m.unit||'day'","$('leaveUnit').value=leaveIsHalfDay(l)?'half_day':(m.unit||'day')").replace("m.start_time||m.startTime||'09:00'","m.start_time||m.startTime||''").replace("m.end_time||m.endTime||'10:00'","m.end_time||m.endTime||''"));
code=once(code,/^\s*\$\('leaveForm'\)\.addEventListener\('submit',async ev=>\{[^\n]+\}\);$/m,`  $('leaveForm').addEventListener('submit',async ev=>{
    ev.preventDefault();const button=$('leaveForm').querySelector('button[type="submit"]');if(button?.disabled)return;
    try{const leave=readLeaveFormEntry();if(button)button.disabled=true;await saveLeave(leave);closeModal('leaveModal');toast('休假／人員狀態已儲存',leaveDisplayLabel(leave));}
    catch(error){toast('儲存失敗',friendlyAuthError(error),'error');}
    finally{if(button)button.disabled=false;}
  });`,'leave submit handler');
code=replaceFunction(code,'saveLeave',fn=>fn.replace('async function saveLeave(l){','async function saveLeave(l){validateLeaveEntry(l);'));
code=once(code,"state.leaves=(c.data||[]).map(x=>({id:x.id,employeeId:x.employee_id,date:x.work_date,type:canonicalLeaveType(x.leave_type),note:x.note||'',meta:Object.prototype.hasOwnProperty.call(x,'leave_meta')?((x.leave_meta&&typeof x.leave_meta==='object')?x.leave_meta:{}):(localLeaves.get(x.id)?.meta||{})}));","state.leaves=(c.data||[]).map(x=>mapLeaveFromCloud(x,localLeaves.get(x.id)));",'cloud leave loader');
code=once(code,"upsert(state.leaves,{id:row.id,employeeId:row.employee_id,date:row.work_date,type:row.leave_type,note:row.note||'',meta:Object.prototype.hasOwnProperty.call(row,'leave_meta')?((row.leave_meta&&typeof row.leave_meta==='object')?row.leave_meta:{}):(old?.meta||{})})","upsert(state.leaves,mapLeaveFromCloud(row,old))",'realtime leave loader');
code=replaceFunction(code,'loadViewerWeek',fn=>once(fn,"type:String(x.type||x.leave_type||'休假'),note:''","type:String(x.type||x.leave_type||'休假'),note:'',meta:x.meta||x.leave_meta||{}",'viewer metadata'));
code=replaceFunction(code,'renderLeave',fn=>fn.replaceAll('esc(canonicalLeaveType(l.type))','esc(leaveBadgeLabel(l))'));
code=replaceFunction(code,'renderWeeklyLeaveSummary',fn=>fn.replaceAll('esc(canonicalLeaveType(l.type))','esc(leaveScheduleLabel(l))'));
code=replaceFunction(code,'buildSchedulePrintSvg',fn=>once(fn,'label=`${employeeName(l.employeeId)} · ${type}`','label=`${employeeName(l.employeeId)} · ${leaveScheduleLabel(l)}`','print half-day label'));
// Spreadsheet display cells retain original leave type and append half-day time only for partial leave.
code=code.replaceAll('${canonicalLeaveType(l.type)}','${leaveScheduleLabel(l)}');
code=replaceFunction(code,'buildScheduleImageExportSvg',fn=>{
  const line=fn.split('\n').find(l=>l.includes('p.push(`<text')&&l.includes('class="leaveChip"')&&l.includes('${esc(label)}'));
  if(!line)throw Error('PNG leave chip text not found');
  const replacement=`        if(leaveIsHalfDay(l)){
          const halfLabel=label+' · 半天',r=leaveHourRange(l),size=Math.min(22,(chipW-12)/(Array.from(halfLabel).length*1.04));
          p.push(\`<text x="\${bx+chipW/2}" y="\${by+chipH*.42}" text-anchor="middle" style="font-size:\${size}px;font-weight:850">\${esc(halfLabel)}</text>\`);
          p.push(\`<text x="\${bx+chipW/2}" y="\${by+chipH*.83}" text-anchor="middle" style="font-size:18px;font-weight:700">\${esc(r.start+'–'+r.end)}</text>\`);
        }else{${line.trim()}}`;
  return fn.replace(line,()=>replacement);
});
parse(code,{ecmaVersion:'latest',sourceType:'module'});
html=html.slice(0,range.start)+code+html.slice(range.end);
html=once(html,'<option value="day">整日</option><option value="hour">小時</option>','<option value="day">整日</option><option value="half_day">半天（0.5 日）</option><option value="hour">小時</option>','unit options');
html=html.replace('V3.33.8</b>','V3.33.9</b>');
await fs.writeFile('web-overlay/index.html',html);
await fs.writeFile('web-overlay/RELEASE_NOTES_V3.33.9.txt','TITV V3.33.9 / Desktop 4.0.6\n台內休假新增半天（0.5 日）與實際起訖；保留原假別代碼。休假表、週摘要、PNG、列印與 Excel 顯示半天。半天沿用 leave_meta.unit=hour 並新增 duration=half_day，維持舊版時段衝突相容。\n');
await fs.writeFile('web-overlay/READ_ME.txt','前端同步更新檔：V3.33.9。包含 index.html、ui-icons.css、ui-icons.mjs。需合併至目前完整 Netlify 專案，保留既有 Functions、_headers、_redirects、資產及 netlify.toml，勿以僅含前端的資料夾取代完整部署。\n');
const desktop=html.replaceAll('${location.origin}',WEB).replace('<title>TITV 工程部製播排班系統</title>','<title>TITV 工程部製播排班系統</title><meta name="titv-desktop-version" content="4.0.6">');
await fs.writeFile('app/index.html',desktop);
const manifest={desktopVersion:'4.0.6',coreVersion:'V3.33.9',sourceCore:'V3.33.8',feature:'internal-half-day',webSha256:hash(html),desktopSha256:hash(desktop),schemaMigrationRequired:false,metadata:{unit:'hour',duration:'half_day',day_fraction:0.5},webProductionDeployed:false};
await fs.writeFile('app/repair-info.json',JSON.stringify(manifest,null,2));
await fs.writeFile('qa/halfday-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
