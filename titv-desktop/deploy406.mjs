import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const REPO='thewritethatstaysmusic2025-cmyk/register',BRANCH='titv-desktop-406-halfday',SITE='1c5f63b6-3dae-49ab-8f8f-987e65c5a625';
const keyFile=path.join(process.env.RUNNER_TEMP,'titv406-private.pem');
async function gh(file){const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+file+'?ref='+BRANCH,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});if(r.status===404)return null;if(!r.ok)throw Error('GitHub contents HTTP '+r.status);return r.json();}
if(process.argv[2]==='keygen'){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 await fs.writeFile(keyFile,privateKey,{mode:0o600});
 const file='titv-desktop/deploy406-public.json',old=await gh(file);const data={runId:process.env.GITHUB_RUN_ID,publicKey};
 const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+file,{method:'PUT',headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({message:'[skip ci] Publish one-run deployment encryption public key',branch:BRANCH,content:Buffer.from(JSON.stringify(data)).toString('base64'),...(old?{sha:old.sha}:{})})});if(!r.ok)throw Error('Public key publication failed '+r.status);console.log('One-run public key is ready. No deployment credential is stored in source control.');
}else if(process.argv[2]==='deploy'){
 assert.equal(JSON.parse(await fs.readFile('qa/halfday-test-report.json','utf8')).passed,true);assert.equal(JSON.parse(await fs.readFile('qa/windows-smoke.json','utf8')).passed,true);
 let envelope;
 for(let i=0;i<100;i++){const item=await gh('titv-desktop/deploy406-envelope.json');if(item){const value=JSON.parse(Buffer.from(item.content,'base64').toString('utf8'));if(value.runId===process.env.GITHUB_RUN_ID){envelope=value;break;}}await new Promise(r=>setTimeout(r,5000));}
 if(!envelope)throw Error('Deployment authorization not supplied for this run');
 const key=crypto.privateDecrypt({key:await fs.readFile(keyFile),oaepHash:'sha256'},Buffer.from(envelope.key,'base64'));const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));const secret=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));const proxy=secret.proxy.replace(/\/$/,'');
 assert(proxy.startsWith('https://netlify-mcp.netlify.app/proxy/'));console.log('::add-mask::'+proxy);await fs.rm(keyFile,{force:true});
 const api=async(endpoint,options={})=>{const r=await fetch(proxy+'/api/v1'+endpoint,{...options,headers:{Accept:'application/json',...(options.headers||{})},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Netlify '+endpoint+' HTTP '+r.status);return r.json();};
 const site=await api('/sites/'+SITE);assert.equal(site.id,SITE);const baseId=site.published_deploy?.id||site.deploy_id;assert(baseId,'No published deploy identifier');const previous=await api('/deploys/'+baseId);
 const original=await (await fetch('https://titv-engineering-scheduler.netlify.app/?verify=406',{signal:AbortSignal.timeout(25000)})).text();assert.equal(crypto.createHash('sha256').update(original.replace(/^\uFEFF/,'')).digest('hex'),'99967353a3cf9a1729c99e6078f0bd9f54a5718edf66b7bc4488387bfccca3f1','Production changed since source selection. Refusing to overwrite.');
 const entries=[];for(let page=1;page<=20;page++){const list=await api('/sites/'+SITE+'/files?per_page=100&page='+page);assert(Array.isArray(list));entries.push(...list);if(list.length<100)break;}
 const files=Object.fromEntries(entries.map(x=>[x.path.startsWith('/')?x.path:'/'+x.path,x.sha]));assert(files['/index.html']);assert(files['/_headers']&&files['/_redirects'],'Refusing to lose existing redirect/header configuration');
 const functions=Object.fromEntries((previous.available_functions||[]).map(x=>[x.n,x.d]));assert.deepEqual(Object.keys(functions).sort(),['line-send','line-status','line-webhook','taiwan-holidays']);
 const uploads=new Map();for(const file of ['index.html','ui-icons.mjs','ui-icons.css','release-info.json']){const data=await fs.readFile('web-overlay/'+file),sha=crypto.createHash('sha1').update(data).digest('hex');files['/'+file]=sha;uploads.set(sha,{file,data});}
 const draft=await api('/sites/'+SITE+'/deploys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files,functions,draft:true,title:'TITV V3.33.9 / Desktop 4.0.6 — 台內半天休假',...(previous.functions_config?{functions_config:previous.functions_config}:{})})});
 assert.equal((draft.required_functions||[]).length,0,'Existing functions were not reusable. Draft remains unpublished.');
 for(const digest of draft.required||[]){const item=uploads.get(digest);assert(item,'Unchanged file unexpectedly required: '+digest);await api('/deploys/'+draft.id+'/files/'+encodeURIComponent(item.file),{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:item.data});}
 let ready;for(let i=0;i<100;i++){const d=await api('/deploys/'+draft.id);if(d.state==='error')throw Error('Netlify draft processing failed');if(d.state==='ready'){ready=d;break;}await new Promise(r=>setTimeout(r,3000));}assert(ready,'Netlify draft not ready');
 assert.deepEqual(Object.fromEntries((ready.available_functions||[]).map(x=>[x.n,x.d])),functions,'Backend functions changed unexpectedly');
 const expected=await fs.readFile('web-overlay/index.html','utf8');const draftUrl=ready.deploy_ssl_url||ready.deploy_url?.replace('http:','https:');assert(draftUrl);const observed=await (await fetch(draftUrl+'/index.html',{signal:AbortSignal.timeout(25000)})).text();assert.equal(crypto.createHash('sha256').update(observed).digest('hex'),crypto.createHash('sha256').update(expected).digest('hex'),'Draft bytes differ from tested web app');
 const still=await api('/sites/'+SITE);assert.equal(still.published_deploy?.id||still.deploy_id,baseId,'A concurrent production deployment occurred');
 await api('/sites/'+SITE+'/deploys/'+draft.id+'/restore',{method:'POST'});
 const final=await api('/sites/'+SITE);assert.equal(final.published_deploy?.id||final.deploy_id,draft.id);
 const live=await (await fetch('https://titv-engineering-scheduler.netlify.app/?verify='+Date.now(),{signal:AbortSignal.timeout(25000)})).text();assert(live.includes("const SYSTEM_VERSION='V3.33.9'"));assert(live.includes('leaveHalfDayPeriod'));assert(live.includes('ui-icons.mjs'));
 const result={published:true,siteId:SITE,previousDeploy:baseId,deployId:draft.id,core:'V3.33.9',desktop:'4.0.6',filesPreserved:entries.length,functionsPreserved:Object.keys(functions),webSha256:crypto.createHash('sha256').update(live).digest('hex'),url:'https://titv-engineering-scheduler.netlify.app'};
 await fs.writeFile('qa/web-deployment406.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}else throw Error('Use keygen or deploy');
