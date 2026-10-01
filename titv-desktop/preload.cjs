const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('titvDesktop',Object.freeze({
  isDesktop:true,
  version:'4.0.13',
  publicWebUrl:'https://titv-engineering-scheduler.netlify.app',
  fetchBackend:(path,options={})=>ipcRenderer.invoke('titv:backend',path,{
    method:options.method||'GET',headers:options.headers||{},body:options.body??null
  }),
  checkForUpdates:()=>ipcRenderer.invoke('titv:check-update')
}));
