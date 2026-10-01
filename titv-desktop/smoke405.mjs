import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const app=await electron.launch({executablePath:path.resolve('dist/win-unpacked/TITV 工程部製播排班系統.exe'),args:['--user-data-dir='+path.resolve('qa/electron-profile')],timeout:45000});
try{
  await app.context().route('https://**/*',route=>route.abort());
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>window.__schedulerBootReady&&window.titvDesktop?.version==='4.0.5',null,{timeout:25000});
  const native=await app.evaluate(({app,BrowserWindow,Menu})=>({version:app.getVersion(),packaged:app.isPackaged,security:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().webSecurity,menu:Menu.getApplicationMenu().items.flatMap(x=>(x.submenu?.items||[]).map(i=>i.label))}));
  assert.equal(native.version,'4.0.5');assert.equal(native.packaged,true);assert.equal(native.security,true);assert(native.menu.includes('檢查軟體更新'));
  const renderer=await page.evaluate(async()=>{
    let rejected=false;try{await window.titvDesktop.fetchBackend('https://example.com/');}catch{rejected=true;}
    return {version:window.titvDesktop.version,core:document.getElementById('systemVersionText')?.textContent,slots:document.querySelectorAll('[data-titv-icon]').length,nodeRequire:typeof require,untrustedEndpointRejected:rejected,hasQA:typeof window.__qa!=='undefined'};
  });
  assert.equal(renderer.slots,48);assert.equal(renderer.core,'V3.33.8');assert.equal(renderer.nodeRequire,'undefined');assert.equal(renderer.untrustedEndpointRejected,true);assert.equal(renderer.hasQA,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:'qa/screenshots/windows-packaged-login.png'});
  const result={passed:true,native,renderer,errors,scope:'Windows CI packaged application launch. No live login or production writes.'};
  await fs.writeFile('qa/windows-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await app.close();}
