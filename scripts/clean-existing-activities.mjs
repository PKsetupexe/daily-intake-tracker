import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSyncEngine} from '../electron/sync-engine.mjs';
const root=readFileSync('work/activity-cleanup-path.txt','utf8').trim();
const apply=process.argv.includes('--apply');
const file=apply?path.join(process.env.APPDATA,'daily-intake-desktop/data/food_manage.sqlite'):path.join(root,'trial.sqlite');
const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=10000');
const stores=['exerciseLibrary','walkingProfiles','foodLibrary','foods','exercises','profile','weights','baselineMultipliers','targetScenarios','targetScenarioDefaults','energyTargetDays','energyTargetDefaults'];
const getSetting=(key,fallback='')=>key==='sync_enabled'?'false':db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??fallback;
const setSetting=(key,value)=>db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
const before=db.prepare("SELECT store,id,data,deleted FROM records WHERE store IN ('exercises','foods','exerciseLibrary')").all();
const engine=createSyncEngine({database:db,getSetting,setSetting,stores});engine.initialize({reconcile:false});
engine.exportBackupFile(path.join(root,apply?'before-live-cleanup.json':'before-trial-cleanup.json'));
engine.batchLocalChanges(()=>{engine.reconcileExerciseLibrary();engine.reconcileFoodLibrary();});
let changed=0;
for(const row of before.filter(x=>x.store!=='exerciseLibrary')){
 const after=db.prepare('SELECT data,deleted FROM records WHERE store=? AND id=?').get(row.store,row.id);assert.equal(after.deleted,row.deleted);
 const a=JSON.parse(row.data),b=JSON.parse(after.data);if(a.name!==b.name)changed++;
 for(const key of Object.keys(a).filter(k=>!['name','note','intensity','sex','kind','libraryId','caloriesPer10Minutes','caloriesPer1000'].includes(k)))assert.deepEqual(b[key],a[key],row.id+':'+key);
}
const first=db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;engine.reconcileExerciseLibrary();engine.reconcileFoodLibrary();assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n,first);
const active=db.prepare("SELECT data FROM records WHERE store='exerciseLibrary' AND deleted=0").all().map(x=>JSON.parse(x.data));
const summary={appliedToLive:apply,exerciseLibraryBefore:before.filter(x=>x.store==='exerciseLibrary'&&!x.deleted).length,exerciseLibraryAfter:active.length,renamedHistory:changed,historyPreserved:true,repeatEmitsNoEvents:true,entries:active.map(x=>({name:x.name,sex:x.sex,rate:x.caloriesPer10Minutes}))};
writeFileSync(path.join(root,apply?'live-result.json':'trial-result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));db.close();
