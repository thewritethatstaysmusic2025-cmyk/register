import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parse} from 'acorn';
const BASE='https://6ab3a0849a645030d62dee84--titv-engineering-scheduler.netlify.app';
const WEB='https://titv-engineering-scheduler.netlify.app';
const EXPECTED='99967353a3cf9a1729c99e6078f0bd9f54a5718edf66b7bc4488387bfccca3f1';
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function get(file) {
  const res=await fetch(BASE+file,{signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('Missing application resource: '+file+' HTTP '+res.status);
  return Buffer.from(await res.arrayBuffer());
}
export function moduleRange(html) {
  const m=/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if(!m)throw Error('Application module missing');
  const start=m.index+m[0].indexOf('>')+1;
  return {start,end:start+m[1].length,code:m[1]};
}
export function replaceFunction(code,name,replacement) {
  const node=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name===name);
  if(!node)throw Error('Expected application function missing: '+name);
  return code.slice(0,node.start)+replacement(code.slice(node.start,node.end))+code.slice(node.end);
}
await fs.mkdir('app/vendor',{recursive:true});await fs.mkdir('build',{recursive:true});await fs.mkdir('qa',{recursive:true});
let original=(await get('/')).toString('utf8').replace(/^\uFEFF/,'');
if(hash(original)!==EXPECTED)throw Error('Pinned renderer hash changed; refusing to overwrite an unknown version');
if(!original.includes("const SYSTEM_VERSION='V3.33.8'"))throw Error('Core version mismatch');
await fs.writeFile('qa/original.html',original);
const resources=['vendor/jszip.min.js','TITV_LOGO.png','favicon.ico','favicon-32x32.png','apple-touch-icon.png','android-chrome-192x192.png','site.webmanifest'];
for(const file of resources){const data=await get('/'+file);await fs.writeFile(path.join('app',file),data);}
for(const file of ['ui-icons.mjs','ui-icons.css'])await fs.copyFile(file,'app/'+file);
let html=original;
let slots=0;
html=html.replace(/<svg\b([^>]*\bclass="[^"]*\btribal-icon\b[^"]*"[^>]*)>\s*<use\b[^>]*\bhref="#(i-[a-z0-9-]+)"[^>]*>\s*<\/use>\s*<\/svg>/g,(full,attrs,id)=>{
  slots++;
  return `<span class="titv-icon-slot" data-titv-icon="${id}" aria-hidden="true">${full}</span>`;
});
if(slots!==48)throw Error('Unexpected icon markup count '+slots+'; review source before patching');
html=html.replace('</head>','<link rel="stylesheet" href="./ui-icons.css">\n</head>');
let range=moduleRange(html),code=range.code;
code=replaceFunction(code,'syncTopbarQuickAction',()=>`function syncTopbarQuickAction(){
  const btn=$('quickAddBtn');if(!btn)return;
  const editable=canEdit();
  const label=({schedule:'新增工作',staff:'新增人員',leave:'新增休假',templates:'新增模板'})[currentView]||'';
  btn.classList.toggle('hidden',!label||!editable);btn.disabled=!editable||!label;
  btn.title=!editable?'目前帳號只有檢視權限':label;btn.setAttribute('aria-label',label||'新增');btn.dataset.quickAction=currentView;
  let text=btn.querySelector(':scope > .titv-action-label');
  if(!text){text=document.createElement('span');text.className='titv-action-label';
    for(const child of [...btn.childNodes])if(child.nodeType===3)child.remove();
    btn.appendChild(text);
  }
  text.textContent=label;syncUiIcons(btn);
}`);
code=replaceFunction(code,'renderCurrentView',fn=>fn.slice(0,-1)+'\n  syncUiIcons();\n}');
code=replaceFunction(code,'renderAll',()=>`function renderAll(){
  renderBrand();renderAccount();renderPermissionUI();
  const renderers={dashboard:renderDashboard,schedule:renderSchedule,staff:renderStaff,leave:renderLeave,compliance:renderCompliance,templates:renderTemplates,audit:renderAudit,settings:renderSettings};
  for(const [view,render] of Object.entries(renderers))if(view!==currentView)render();
  setView(currentView);syncUiIcons();
}`);
code=replaceFunction(code,'bindUI',fn=>fn.replace('function bindUI(){','function bindUI(){\n  if(titvUIBound)return;\n  titvUIBound=true;'));
code="import {syncUiIcons} from './ui-icons.mjs';\nlet titvUIBound=false;\n"+code;
parse(code,{ecmaVersion:'latest',sourceType:'module'});
html=html.slice(0,range.start)+code+html.slice(range.end);
const protectedFunctions=['buildSchedulePrintSvg','buildSchedulePrintSheet','buildScheduleImageExportSvg','renderPrintSchedule'];
const before=moduleRange(original).code, after=moduleRange(html).code;
function fnText(code,name){const n=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(x=>x.type==='FunctionDeclaration'&&x.id?.name===name);if(!n)throw Error('Missing protected function '+name);return code.slice(n.start,n.end);}
for(const name of protectedFunctions)if(fnText(before,name)!==fnText(after,name))throw Error('Export function modified: '+name);
const logo=/const DEFAULT_LOGO_DATA\s*=([^;]+);/.exec(original)?.[0];
if(logo&&!html.includes(logo))throw Error('Logo data changed');
// Shipping web patch has no testing hooks and remains same-origin for backend calls.
await fs.mkdir('web-overlay/vendor',{recursive:true});
await fs.writeFile('web-overlay/index.html',html);
for(const file of ['ui-icons.mjs','ui-icons.css'])await fs.copyFile(file,'web-overlay/'+file);
await fs.writeFile('web-overlay/READ_ME.txt','TITV UI repair 4.0.5 / Core V3.33.8\n此資料夾是前端覆蓋檔，不是完整 Netlify 部署包。請將這三個檔案覆蓋至現有完整專案後再部署；勿單獨上傳以免移除後端 Functions。\n不含任何登入繞過、測試帳號、資料庫異動或通知測試。\n');
// Desktop helper already supports a restricted preload bridge. Keep backend paths relative for that bridge.
html=html.replaceAll('${location.origin}',WEB);
html=html.replace('<title>TITV 工程部製播排班系統</title>','<title>TITV 工程部製播排班系統</title><meta name="titv-desktop-version" content="4.0.5">');
await fs.writeFile('app/index.html',html);
const manifest={desktopVersion:'4.0.5',coreVersion:'V3.33.8',source:BASE,sourceSha256:EXPECTED,patchedSha256:hash(html),ownedIconSlots:slots,protectedFunctions,webProductionDeployed:false};
await fs.writeFile('app/repair-info.json',JSON.stringify(manifest,null,2));
await fs.writeFile('qa/manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
