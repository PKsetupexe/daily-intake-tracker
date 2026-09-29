import {app,BrowserWindow} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
async function smoke(){
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'installer/smoke-profile-v3.2.0-exercise');mkdirSync(out,{recursive:true});const profile=path.join(out,`run-${Date.now()}`);mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.setAppPath(root);BrowserWindow.prototype.show=function(){};
const results=[],pause=ms=>new Promise(r=>setTimeout(r,ms));let win,modelCalories=999,counter=0,lastRequest;
const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;lastRequest=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:'测试完成',actions:[{store:'exercises',value:{id:`ai-${++counter}`,date:'2026-09-11',time:'12:00',name:'步行2000步',steps:2000,duration:20,calories:modelCalories,intensity:'低强度',source:'LLM估算',note:'MET 3.5'}}]})}}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
setTimeout(()=>{writeFileSync(path.join(out,'result.json'),JSON.stringify({error:'timeout',results}));app.exit(1)},60000).unref();
await import('../electron/main.mjs');
try{
for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows()[0];if(win?.webContents.getURL().includes('?api=')&&!win.webContents.isLoading())break;await pause(200)}win.webContents.setBackgroundThrottling(false);await pause(3500);
const run=code=>win.webContents.executeJavaScript(code);
const call=(route,body)=>run(`fetch(new URLSearchParams(location.search).get('api')+${JSON.stringify(route)},{method:'${body?'POST':'GET'}',headers:{'Content-Type':'application/json'},${body?'body:'+JSON.stringify(JSON.stringify(body)):''}}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d})`);
const put=(store,value)=>call('/api/put',{store,value});const check=(v,msg)=>{if(!v)throw Error(msg);results.push(msg)};
const initial=await call('/api/data');check(initial.foodLibrary.length===29&&initial.exerciseLibrary.length===56,'starter catalog available on first launch');
await put('profile',{id:'main',sex:'male',height:175});await put('weights',{id:'weight',date:'2026-09-11',weight:70});
await call('/api/llm/config',{baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'isolated-test',model:'test',enableSearch:false,systemPrompt:'测试自定义提示词'});
const chat=()=>call('/api/llm/chat',{message:'记录步行2000步',selectedDate:'2026-09-11'});
await chat();let data=await call('/api/data');check(data.exercises.find(x=>x.id==='ai-1').calories===49,'AI uses automatic walking rate');check(JSON.stringify(lastRequest).includes('0.35')||JSON.stringify(lastRequest).includes('24.5'),'AI receives walking context');check(JSON.stringify(lastRequest).includes('1个=155g')&&JSON.stringify(lastRequest).includes('少油版煎蛋'),'AI receives serving notes and preparation rules');
await put('walkingProfiles',{sex:'male',mode:'manual',manualCaloriesPer1000:35});await put('weights',{id:'weight',date:'2026-09-11',weight:80});await chat();data=await call('/api/data');check(data.exercises.find(x=>x.id==='ai-2').calories===70,'manual walking rate survives weight and AI changes');
await put('walkingProfiles',{sex:'male',mode:'manual',manualCaloriesPer1000:null});modelCalories=80;await chat();modelCalories=999;await chat();data=await call('/api/data');check(data.walkingProfiles.find(x=>x.sex==='male').manualCaloriesPer1000===40&&data.exercises.find(x=>x.id==='ai-4').calories===80,'AI seeds empty manual rate once');
for(const [id,name,calories] of [['run8','8分配测试跑步30分钟',240],['run5','5分配测试跑步30分钟',390]])await put('exercises',{id,name,calories,duration:30,date:'2026-09-11',time:'12:00',sex:'male',intensity:'中等强度',source:'手动填写',steps:0});data=await call('/api/data');check(data.exerciseLibrary.filter(x=>x.name.includes('测试跑步')).length===2,'pace identities remain distinct');
win.reload();await pause(3500);
const click=text=>run(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()===${JSON.stringify(text)}).click()`);
const input=(selector,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await click('＋ 添加步行');await pause(300);await input('.modal input[type=number]','3000');await pause(150);check((await run(`document.querySelector('.modal h3').textContent`)).includes('120'),'walking UI scales steps');await run(`document.querySelector('form.modal').requestSubmit()`);await pause(400);
await click('＋ 添加运动');await pause(300);await input('.modal > label input','测试跑步');await pause(200);await run(`Array.from(document.querySelectorAll('.library-pick-list button')).find(x=>x.textContent.includes('配速8分/公里')).click()`);await input('.modal input[type=number]','20');await pause(150);check((await run(`document.querySelector('.modal h3').textContent`)).includes('160'),'exercise picker scales duration');await run(`document.querySelector('form.modal').requestSubmit()`);await pause(400);
await run(`Array.from(document.querySelectorAll('nav button')).find(x=>x.textContent.includes('历史')).click()`);await pause(500);await input('.activity-library .library-toolbar input','测试跑步');await run("document.querySelector('.activity-library form.library-toolbar').requestSubmit()");await pause(200);check(await run(`!!document.querySelector('.walking-settings')&&document.querySelectorAll('.activity-library .library-card').length===2`),'separate walking and exercise overviews');
await run(`document.querySelector('.activity-library .library-card button').click()`);await pause(150);await input('.modal input[name=caloriesPer10Minutes]','100');await run(`document.querySelector('form.modal').requestSubmit()`);await pause(400);data=await call('/api/data');check(data.exerciseLibrary.some(x=>x.caloriesPer10Minutes===100),'exercise library edit');
await run(`document.querySelectorAll('.activity-library .library-card button')[1].click()`);await pause(150);await click('确认删除');await pause(350);data=await call('/api/data');check(data.exerciseLibrary.filter(x=>x.name.includes('测试跑步')).length===1&&data.exercises.length===8,'library deletion retains historical exercises');
writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,results},null,2));server.close();app.exit(0);
}catch(e){writeFileSync(path.join(out,'result.json'),JSON.stringify({error:e.stack,results},null,2));if(win)writeFileSync(path.join(out,'failure.html'),await win.webContents.executeJavaScript('document.documentElement.outerHTML'));server.close();app.exit(1)}
}smoke();
