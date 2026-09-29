import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
async function smoke() {
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root,'installer','smoke-profile-v3.2.0-food');
mkdirSync(output,{recursive:true});
const profile = path.join(output, `run-${Date.now()}`); mkdirSync(profile,{recursive:true}); app.setPath('userData',profile); app.setAppPath(root);
BrowserWindow.prototype.show = function() {};
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const result = []; let currentWindow;
setTimeout(()=>{writeFileSync(path.join(output,'result.json'),JSON.stringify({error:'timeout',result}));app.exit(1);},45000).unref();
app.on('web-contents-created', (_event, contents) => contents.on('console-message', (...args) => result.push(args.slice(1).map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' | '))));
await import('../electron/main.mjs');
try {
  let win;
  for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows()[0]; if(win && win.webContents.getURL().includes('?api=') && !win.webContents.isLoading())break;await pause(200);}
  currentWindow = win; win.webContents.setBackgroundThrottling(false);
  win.webContents.on("console-message", (_event, details) => result.push(String(details.message)));
  const run = async code => { try { return await win.webContents.executeJavaScript(code); } catch(e) { throw Error(code + " :: " + e.message); } };
  const search=async(selector)=>{await run("(()=>{const el=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'测试米饭');el.dispatchEvent(new Event('input',{bubbles:true}));})()");await pause(180);};
  await pause(3500);
  const call = (route,body) => run(`fetch(new URLSearchParams(location.search).get('api')+${JSON.stringify(route)},{method:${JSON.stringify(body?'POST':'GET')},headers:{'Content-Type':'application/json'},${body?'body:'+JSON.stringify(JSON.stringify(body))+',':''}}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);return data})`);
  await call('/api/put',{store:'foods',value:{id:'smoke-rice',date:'2026-09-10',time:'12:00',meal:'午餐',name:'测试米饭 (350g)',weight:350,calories:420,protein:10.5,carbs:91,fat:1.4,note:'独立测试数据'}});
  let data=await call('/api/data'); if(data.foodLibrary.find(x=>x.name==='测试米饭').calories!==120)throw Error('conversion');if(data.foods[0].name!=='测试米饭'||!data.foods[0].note.includes('350g'))throw Error('food name split');result.push('350g -> 100g API migration and name/note split');
  const config=await call('/api/llm/config');if(!config.systemPrompt.includes('食品名称与备注规则'))throw Error('prompt rules missing');
  await run(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='选择已记录过的食物').click()`);
  await pause(700);await search('.library-picker input');
  await run(`Array.from(document.querySelectorAll('.library-pick-list button')).find(x=>x.textContent.includes('测试米饭')).click()`);
  await pause(100);
  await run(`(()=>{const el=document.querySelector('.library-picker input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'200');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(200);
  const preview = await run(`document.querySelector('.library-picker .library-nutrients').textContent`);
  if(!preview.includes('240'))throw Error('scaled preview '+preview);
  await run(`document.querySelector('.library-picker').requestSubmit()`);await pause(500);
  data=await call('/api/data');if(!data.foods.some(x=>x.weight===200&&x.calories===240))throw Error('quick add');result.push('picker 200g -> 240kcal saved');
  await run(`Array.from(document.querySelectorAll('nav button')).find(x=>x.textContent.includes('历史')).click()`);await pause(700);await search('.food-library-section .library-toolbar input');await run("document.querySelector('.food-library-section form.library-toolbar').requestSubmit()");await pause(150);
  if(!await run(`Boolean(document.querySelector('.food-library-section .library-card'))`))throw Error('overview missing');
  await run(`document.querySelector('.library-card button').click()`);await pause(200);
  if(!await run(`document.querySelector('#library-edit-title').textContent.includes('修改食品')`))throw Error('edit dialog');
  await run(`(()=>{const el=document.querySelector('.modal input[name=protein]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'5');el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form.modal').requestSubmit();})()`);await pause(500);
  data=await call('/api/data');if(data.foodLibrary.find(x=>x.name==='测试米饭').protein!==5)throw Error('edit save');result.push('overview edit all nutrients');
  if(!await run(`document.querySelector('.trend-stack').getBoundingClientRect().bottom <= document.querySelector('.food-library-section').getBoundingClientRect().top`))throw Error('library must follow nutrient trends');
  await run(`document.querySelector('.food-library-section').scrollIntoView();document.documentElement.dataset.theme='light'`);await pause(400);
  writeFileSync(path.join(output,'history-light.png'),(await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  await run(`document.documentElement.dataset.theme='dark'`);await pause(400);
  writeFileSync(path.join(output,'history-dark.png'),(await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  await run(`document.querySelectorAll('.library-card button')[1].click()`);await pause(400);
  await run(`Array.from(document.querySelectorAll('.modal button')).find(x=>x.textContent==='确认删除').click()`);await pause(350);
  data=await call('/api/data');if(data.foodLibrary.some(x=>x.name==='测试米饭')||data.foods.length!==2)throw Error('delete preservation');result.push('delete retains dietary records');
  writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,result},null,2));app.exit(0);
} catch(error) { if(currentWindow) { writeFileSync(path.join(output,'failure.html'),await currentWindow.webContents.executeJavaScript('document.documentElement.outerHTML')); writeFileSync(path.join(output,'failure.png'),(await currentWindow.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); } writeFileSync(path.join(output,'result.json'),JSON.stringify({error:error.stack,result},null,2));app.exit(1);}

}
smoke();
