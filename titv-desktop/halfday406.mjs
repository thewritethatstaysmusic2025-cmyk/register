import fs from 'node:fs/promises';
import {parse} from 'acorn';
import crypto from 'node:crypto';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function replaceFunction(code,name,fn){const n=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name===name);if(!n)throw Error('Missing function '+name);return code.slice(0,n.start)+fn(code.slice(n.start,n.end))+code.slice(n.end);}
function once(text,from,to){if(!text.includes(from))throw Error('Missing expected source: '+from.slice(0,100));return text.replace(from,()=>to);}
export function patchHalfday(html){
html=once(html,'<optgroup label="TITV 台內狀態">','<optgroup label="TITV 台內狀態"><option value="半天">半天（0.5 日）</option>');
html=once(html,'<option value="day">整日</option><option value="hour">小時</option>','<option value="day">整日</option><option value="half_day">半天（0.5 日）</option><option value="hour">小時</option>');
html=once(html,'<div id="leaveTimeSection"',`<div id="leaveHalfDaySection" class="hidden" style="margin-top:12px"><label style="display:grid;gap:6px">半天時段<select id="leaveHalfDayPeriod" class="control"><option value="custom">自訂時段（依實際班別）</option><option value="am">上午半天（預設 09:00–13:00）</option><option value="pm">下午半天（預設 13:00–17:00）</option></select></label><p style="font-size:12px;line-height:1.6;margin:8px 0 0">半天計 0.5 日。預設時間可調整；衝突檢查只涵蓋下方時間，不會封鎖整天。</p></div>\n<div id="leaveTimeSection"`);
const m=/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);if(!m)throw Error('No application module');let code=m[1];
code=once(code,"const SYSTEM_VERSION='V3.33.8'","const SYSTEM_VERSION='V3.33.9'");
code=once(code,"const TITV_INTERNAL_STATUS=new Set([","const TITV_INTERNAL_STATUS=new Set(['半天',");
code=replaceFunction(code,'leaveIsHourly',()=>`function leaveIsHalfDay(l){const m=leaveMeta(l);return canonicalLeaveType(l?.type)==='半天'||m.duration==='half_day'||m.unit==='half_day';}
function leaveIsHourly(l){return leaveMeta(l).unit==='hour'&&!leaveIsHalfDay(l);}
function leaveHasTimeRange(l){return leaveIsHourly(l)||leaveIsHalfDay(l);}
function leaveAllowsHalfDay(type){return TITV_INTERNAL_STATUS.has(canonicalLeaveType(type))&&!leaveIsWorkStatus(type);}
function leaveSummaryLabel(l){return leaveIsHalfDay(l)?leaveDisplayLabel(l):canonicalLeaveType(l?.type);}`);
code=replaceFunction(code,'leaveDisplayLabel',()=>`function leaveDisplayLabel(l){if(!l)return '';const m=leaveMeta(l),type=canonicalLeaveType(l.type),parts=[type];if(leaveIsHalfDay(l)&&type!=='半天')parts.push('半天');if(m.detail)parts.push(m.detail);if(leaveHasTimeRange(l)){const r=leaveHourRange(l);parts.push(r.start&&r.end?r.start+'–'+r.end:'時段未設定');}return parts.join('｜');}`);
code=replaceFunction(code,'leaveConflictsWithEvent',fn=>fn.replace('!leaveIsHourly(l)','!leaveHasTimeRange(l)'));
code=replaceFunction(code,'leaveFullDayCount',()=>`function leaveFullDayCount(rows=[]){return rows.reduce((sum,l)=>sum+(leaveIsHalfDay(l)?0.5:leaveIsHourly(l)?0:1),0);}`);
code=replaceFunction(code,'syncLeaveModalRule',()=>`function syncLeaveModalRule(){
const type=canonicalLeaveType($('leaveType')?.value||''),detail=$('leaveDetail'),unit=$('leaveUnit'),detailWrap=$('leaveDetailWrap'),unitWrap=$('leaveUnitWrap'),time=$('leaveTimeSection'),card=$('leaveRuleCard');if(!detail||!unit||!card)return;
const halfAllowed=leaveAllowsHalfDay(type),half=type==='半天'||(halfAllowed&&unit.value==='half_day'),hourly=leaveAllowsHourly(type),old=detail.value,opts=leaveDetailOptions(type);
detail.innerHTML=opts.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');if(opts.some(x=>x[0]===old))detail.value=old;detailWrap.classList.toggle('hidden',!opts.length);
for(const option of unit.options){option.hidden=option.value==='half_day'?!halfAllowed:option.value==='hour'?!hourly:type==='半天';option.disabled=option.hidden;}
unitWrap.classList.toggle('hidden',!hourly&&!halfAllowed);unit.disabled=type==='半天'||(!hourly&&!halfAllowed);
if(half)unit.value='half_day';else if(!hourly||unit.value==='half_day')unit.value='day';
const timed=half||unit.value==='hour';time.classList.toggle('hidden',!timed);$('leaveHalfDaySection')?.classList.toggle('hidden',!half);
for(const id of ['leaveStartTime','leaveEndTime']){$(id).required=timed;$(id).disabled=!timed;}
const p=leavePolicy(type);if(p)card.innerHTML='<strong>'+esc(p.label)+' <span class="legal-tag">'+esc(p.group)+'</span></strong><p>'+esc(p.limit)+'｜'+esc(p.pay)+'</p><p>'+esc(p.basis)+'</p><p>'+esc(p.summary)+'</p>';else card.innerHTML='<strong>'+esc(type||'TITV 台內狀態')+'</strong><p>'+(half?'台內半天休假，記錄為 0.5 日。請填入當日核准休假時間；未休假的時段仍可安排勤務。跨日休假請分日期登記。':'此項為電視台內部排班／人員狀態。休O、休F、輪休維持原有定義與使用方式，不由法規假別模組重新命名或改寫。')+'</p>';
}
function applyHalfDayPreset(){const period=$('leaveHalfDayPeriod').value;if(period==='am'){$('leaveStartTime').value='09:00';$('leaveEndTime').value='13:00';}if(period==='pm'){$('leaveStartTime').value='13:00';$('leaveEndTime').value='17:00';}}
function readLeaveForm(){
const type=canonicalLeaveType($('leaveType').value),half=type==='半天'||(leaveAllowsHalfDay(type)&&$('leaveUnit').value==='half_day'),unit=half?'hour':leaveAllowsHourly(type)?$('leaveUnit').value:'day',detail=$('leaveDetailWrap').classList.contains('hidden')?'':$('leaveDetail').value;
let start='',end='';if(unit==='hour'){start=normalizeTime24($('leaveStartTime').value);end=normalizeTime24($('leaveEndTime').value);if(!start||!end||minutes(end)<=minutes(start))throw Error('請填入有效的開始與結束時間，且結束時間需晚於開始時間；跨日休假請分日期登記。');}
const existing=state.leaves.find(l=>l.id===$('leaveId').value),meta={...leaveMeta(existing),unit,detail,start_time:start,end_time:end};for(const key of ['duration','day_fraction','period','startTime','endTime'])delete meta[key];if(half)Object.assign(meta,{duration:'half_day',day_fraction:0.5,period:$('leaveHalfDayPeriod').value||'custom'});
return {id:$('leaveId').value||uuid(),date:$('leaveDate').value,employeeId:$('leaveEmployee').value,type,note:$('leaveNote').value.trim(),meta};
}`);
code=replaceFunction(code,'openLeaveModal',()=>`function openLeaveModal(id=null,prefill={}){
if(!canEdit())return;refreshEmployeeOptions();const stored=id?state.leaves.find(x=>x.id===id):null;if(id&&!stored){toast('休假資料已異動','請重新開啟休假表。','warning');return;}
const l=stored?deepClone(stored):{id:'',date:prefill.date||leaveWeek,employeeId:prefill.employeeId||state.employees[0]?.id||'',type:prefill.type||'休O',note:'',meta:{unit:'day'}};const m=leaveMeta(l),half=leaveIsHalfDay(l);
$('leaveModalTitle').textContent=id?'編輯休假／人員狀態':'新增休假／人員狀態';$('leaveId').value=l.id;$('leaveDate').value=l.date;$('leaveEmployee').value=l.employeeId;$('leaveType').value=canonicalLeaveType(l.type);$('leaveNote').value=l.note||'';$('leaveUnit').value=half?'half_day':m.unit||'day';$('leaveStartTime').value=m.start_time||m.startTime||'';$('leaveEndTime').value=m.end_time||m.endTime||'';$('leaveHalfDayPeriod').value=['am','pm'].includes(m.period)?m.period:'custom';syncLeaveModalRule();if(m.detail&&[...$('leaveDetail').options].some(o=>o.value===m.detail))$('leaveDetail').value=m.detail;$('deleteLeaveBtn').classList.toggle('hidden',!id);
if(!$('leaveType').dataset.ruleBound){$('leaveType').addEventListener('change',syncLeaveModalRule);$('leaveUnit').addEventListener('change',syncLeaveModalRule);$('leaveDetail').addEventListener('change',syncLeaveModalRule);$('leaveHalfDayPeriod').addEventListener('change',applyHalfDayPreset);for(const field of ['leaveStartTime','leaveEndTime']){$(field).addEventListener('input',()=>{$('leaveHalfDayPeriod').value='custom';});}$('leaveType').dataset.ruleBound='1';}openModal('leaveModal');
}`);
code=replaceFunction(code,'loadViewerWeek',fn=>once(fn,"type:String(x.type||x.leave_type||'休假'),note:''","type:String(x.type||x.leave_type||'休假'),note:'',meta:x.meta||x.leave_meta||{}"));
code=replaceFunction(code,'bindUI',fn=>fn.replace(/\$\('leaveForm'\)\.addEventListener\('submit',[^\n]+/,()=>`$('leaveForm').addEventListener('submit',async ev=>{ev.preventDefault();let l;try{l=readLeaveForm();}catch(err){toast('休假時間不正確',err.message,'warning');return;}const button=ev.submitter;if(button?.disabled)return;if(button)button.disabled=true;try{await saveLeave(l);closeModal('leaveModal');toast('休假／人員狀態已儲存',leaveDisplayLabel(l));}catch(err){toast('儲存失敗',friendlyAuthError(err),'error');}finally{if(button)button.disabled=false;}});`));
code=replaceFunction(code,'renderLeave',fn=>fn.replaceAll('leaveIsHourly(l)','leaveHasTimeRange(l)'));
code=replaceFunction(code,'renderWeeklyLeaveSummary',fn=>fn.replaceAll('esc(canonicalLeaveType(l.type))','esc(leaveSummaryLabel(l))'));
code=replaceFunction(code,'buildSchedulePrintSvg',fn=>once(fn,'${employeeName(l.employeeId)} · ${type}','${employeeName(l.employeeId)} · ${leaveSummaryLabel(l)}'));
code=code.replaceAll('${employeeName(l.employeeId)}｜${canonicalLeaveType(l.type)}','${employeeName(l.employeeId)}｜${leaveSummaryLabel(l)}');
code=replaceFunction(code,'buildScheduleImageExportSvg',fn=>{fn=once(fn,'weeklyChipH=54','weeklyChipH=Object.values(weeklyLeaves).flat().some(leaveIsHalfDay)?78:54');fn=once(fn,'chipH=40','chipH=weeklyChipH-14');const mark='${esc(label)}</text>`);';fn=once(fn,mark,mark+`\nif(leaveIsHalfDay(l)){const r=leaveHourRange(l);p.push(\`<text x="\${bx+chipW/2}" y="\${by+50}" text-anchor="middle" class="leaveChip" style="font-size:18px">\${esc(r.start&&r.end?r.start+'–'+r.end:'時段未設定')}</text>\`);}`);return fn;});
code=replaceFunction(code,'saveLeave',fn=>fn.replace('${l.date} ${l.type}','${l.date} ${leaveDisplayLabel(l)}'));
parse(code,{ecmaVersion:'latest',sourceType:'module'});return html.slice(0,m.index)+m[0].replace(m[1],()=>code)+html.slice(m.index+m[0].length);
}
const web=patchHalfday(await fs.readFile('web-overlay/index.html','utf8'));await fs.writeFile('web-overlay/index.html',web);
let desktop=web.replaceAll('${location.origin}','https://titv-engineering-scheduler.netlify.app').replace('<title>TITV 工程部製播排班系統</title>','<title>TITV 工程部製播排班系統</title><meta name="titv-desktop-version" content="4.0.6">');await fs.writeFile('app/index.html',desktop);
const manifest={desktopVersion:'4.0.6',coreVersion:'V3.33.9',feature:'台內半天休假',webSha256:hash(web),desktopSha256:hash(desktop),sharedBusinessLogic:true,metadataContract:{unit:'hour',duration:'half_day',day_fraction:0.5}};
for(const file of ['qa/manifest406.json','app/repair-info.json','web-overlay/release-info.json'])await fs.writeFile(file,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
