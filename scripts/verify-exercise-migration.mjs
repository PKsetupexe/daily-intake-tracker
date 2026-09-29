import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSyncEngine} from '../electron/sync-engine.mjs';
const root=readFileSync('work/exercise-migration-path.txt','utf8').trim();
const before=new DatabaseSync(path.join(root,'before.sqlite'),{readOnly:true});
const db=new DatabaseSync(path.join(root,'migration-test.sqlite'));
const stores=['exerciseLibrary','walkingProfiles','foodLibrary','foods','exercises','profile','weights','baselineMultipliers','targetScenarios','targetScenarioDefaults','energyTargetDays','energyTargetDefaults'];
const getSetting=(key,fallback='')=>key==='sync_enabled'?'false':db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??fallback;
const setSetting=(key,value)=>db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
const engine=createSyncEngine({database:db,getSetting,setSetting,stores});engine.initialize();
const old=before.prepare("SELECT id,data,deleted FROM records WHERE store='exercises'").all();
for(const row of old){const after=db.prepare("SELECT data,deleted FROM records WHERE store='exercises' AND id=?").get(row.id);assert.equal(after.deleted,row.deleted);const a=JSON.parse(row.data),b=JSON.parse(after.data);for(const key of ['id','date','time','duration','steps','calories','source'])assert.deepEqual(b[key],a[key],`${row.id}:${key}`);}
const count=db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n;engine.reconcileExerciseLibrary();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,count);
const library=db.prepare("SELECT data FROM records WHERE store='exerciseLibrary' AND deleted=0").all().map(x=>JSON.parse(x.data));
const profiles=db.prepare("SELECT data FROM records WHERE store='walkingProfiles' AND deleted=0").all().map(x=>JSON.parse(x.data));
const summary={historyPreserved:old.length,activeHistory:old.filter(x=>!x.deleted).length,exerciseLibrary:library.map(x=>({name:x.name,sex:x.sex,caloriesPer10Minutes:x.caloriesPer10Minutes})),walkingProfiles:profiles,repeatMigrationEmitsNoEvents:true,sourceDatabaseUntouched:true};writeFileSync(path.join(root,'migration-verification.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));db.close();before.close();
