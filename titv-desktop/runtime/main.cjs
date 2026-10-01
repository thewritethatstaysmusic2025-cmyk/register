const {app,BrowserWindow,Menu,shell,dialog,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const {autoUpdater}=require('electron-updater');
const ROOT=path.join(__dirname,'..');
const NAME='TITV 工程部製播排班系統';
const PUBLIC_WEB='https://titv-engineering-scheduler.netlify.app';
const ENTRY=pathToFileURL(path.join(ROOT,'app','index.html')).href;
let win=null,checking=false,readyVersion=null,asking=false;
app.setName(NAME);
if(process.platform==='win32')app.setAppUserModelId('tw.org.titv.engineering.scheduler');
const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
const message=options=>win&&!win.isDestroyed()?dialog.showMessageBox(win,options):dialog.showMessageBox(options);
function trusted(event){return Boolean(win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===ENTRY);}
ipcMain.handle('titv:backend',async(event,route,options={})=>{
  if(!trusted(event))throw Error('Untrusted sender');
  if(typeof route!=='string'||!/^\/\.netlify\/functions\/(?:line-status|line-send|taiwan-holidays)(?:\?|$)/.test(route))throw Error('Backend endpoint not permitted');
  const url=new URL(route,PUBLIC_WEB);
  if(url.origin!==PUBLIC_WEB||!['/.netlify/functions/line-status','/.netlify/functions/line-send','/.netlify/functions/taiwan-holidays'].includes(url.pathname))throw Error('Invalid endpoint');
  const method=String(options.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method))throw Error('Method not permitted');
  if(url.pathname.endsWith('/line-send')&&method!=='POST')throw Error('Invalid notification method');
  const body=options.body==null?undefined:options.body;
  if(body!==undefined&&(typeof body!=='string'||Buffer.byteLength(body)>16*1024*1024))throw Error('Invalid request body');
  const headers={};
  for(const [name,value] of Object.entries(options.headers||{}))if(['authorization','apikey','content-type','accept','x-client-info'].includes(name.toLowerCase())&&typeof value==='string')headers[name]=value;
  const response=await fetch(url,{method,headers,body:method==='GET'?undefined:body,redirect:'error',signal:AbortSignal.timeout(45000)});
  const text=await response.text();
  if(Buffer.byteLength(text)>16*1024*1024)throw Error('Backend response too large');
  return {status:response.status,headers:{'content-type':response.headers.get('content-type')||'application/json'},body:text};
});
ipcMain.handle('titv:check-update',async event=>{if(!trusted(event))throw Error('Untrusted sender');await checkUpdates(true);return {checking,readyVersion};});
async function openLink(raw){
  let url;try{url=new URL(raw);}catch{return;}
  if(!['https:','mailto:'].includes(url.protocol))return;
  if(url.protocol==='https:'&&url.origin!==PUBLIC_WEB){const r=await message({type:'question',message:'開啟外部連結？',detail:url.origin,buttons:['取消','開啟'],defaultId:0,cancelId:0,noLink:true});if(r.response!==1)return;}
  await shell.openExternal(url.href);
}
function createWindow(){
  win=new BrowserWindow({title:NAME,icon:path.join(ROOT,'app','android-chrome-192x192.png'),width:1680,height:1030,minWidth:960,minHeight:640,backgroundColor:'#f4f1ea',show:false,webPreferences:{preload:path.join(ROOT,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  win.webContents.session.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='clipboard-sanitized-write'));
  win.webContents.setWindowOpenHandler(({url})=>{openLink(url).catch(console.error);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(url!==ENTRY){event.preventDefault();openLink(url).catch(console.error);}});
  win.loadFile(path.join(ROOT,'app','index.html')).catch(error=>message({type:'error',message:'軟體畫面載入失敗',detail:String(error.message)}));
  win.once('ready-to-show',()=>{win.show();win.maximize();});
  win.on('closed',()=>{win=null;});
}
async function promptInstall(){
  if(!readyVersion||asking)return;
  asking=true;
  try{const r=await message({type:'info',title:'軟體更新',message:`新版 ${readyVersion} 已下載完成`,detail:'請先儲存班表與尚未送出的表單。選擇「稍後」不會關閉軟體，也不會在結束程式時強制安裝。完成工作後，可從「系統 → 安裝已下載更新」繼續。',buttons:['稍後','已儲存，重新啟動更新'],defaultId:0,cancelId:0,noLink:true});if(r.response===1)autoUpdater.quitAndInstall(false,true);}finally{asking=false;}
}
async function checkUpdates(manual=false){
  if(!app.isPackaged){if(manual)await message({type:'info',message:'開發環境不執行安裝更新。'});return;}
  if(readyVersion){if(manual)await promptInstall();return;}
  if(checking)return;
  checking=true;
  try{const result=await autoUpdater.checkForUpdates();if(result?.downloadPromise)result.downloadPromise.catch(()=>{});if(manual&&result?.updateInfo?.version===app.getVersion())await message({type:'info',message:`目前已是最新版本 ${app.getVersion()}`});}
  catch(error){console.error('[Updater]',error.code||error.name);if(manual)await message({type:'warning',message:'目前無法檢查軟體更新',detail:'請確認網路連線。更新失敗不會刪除班表或影響目前版本。'});}
  finally{checking=false;}
}
function configureUpdates(){
  autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowPrerelease=false;autoUpdater.allowDowngrade=false;
  autoUpdater.on('download-progress',p=>{if(win)win.setProgressBar(Math.max(0,Math.min(1,p.percent/100)));});
  autoUpdater.on('update-downloaded',info=>{readyVersion=info.version;if(win)win.setProgressBar(-1);promptInstall().catch(console.error);});
  autoUpdater.on('error',error=>{console.error('[Updater]',error.code||error.name);if(win)win.setProgressBar(-1);});
}
app.whenReady().then(()=>{
  createWindow();configureUpdates();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'系統',submenu:[{label:'關於 TITV 排班系統',click:()=>message({type:'info',message:NAME,detail:`電腦版 ${app.getVersion()}\n核心 V3.33.10 · 台內半天休假\n此版未使用 Windows 發行者憑證簽署。`})},{label:'檢查軟體更新',accelerator:'CmdOrCtrl+Alt+U',click:()=>checkUpdates(true)},{label:'安裝已下載更新',click:()=>readyVersion?promptInstall():message({type:'info',message:'尚無已下載的更新，請先檢查更新。'})},{type:'separator'},{role:'quit',label:'結束程式'}]},
    {label:'編輯',submenu:[{role:'undo',label:'復原'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪下'},{role:'copy',label:'複製'},{role:'paste',label:'貼上'},{role:'selectAll',label:'全選'}]},
    {label:'檢視',submenu:[{role:'resetZoom',label:'實際大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'縮小'},{role:'togglefullscreen',label:'全螢幕'}]}
  ]));
  if(app.isPackaged){setTimeout(()=>checkUpdates(false),5000);setInterval(()=>checkUpdates(false),4*60*60*1000).unref();}
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
