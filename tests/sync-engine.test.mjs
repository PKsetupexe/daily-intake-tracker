import {STARTER_CATALOG} from '../electron/starter-catalog.mjs';
import {normalizeExerciseRecord,exerciseLibraryId} from '../electron/exercise-library.mjs';
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSyncEngine } from "../electron/sync-engine.mjs";

const STORES = [
  "exerciseLibrary", "walkingProfiles", "foodLibrary", "foods", "exercises", "profile", "weights", "baselineMultipliers",
  "targetScenarios", "targetScenarioDefaults", "energyTargetDays", "energyTargetDefaults",
];

function testDevice(root, name, options = {}) {
  const database = new DatabaseSync(path.join(root, `${name}.sqlite`));
  database.exec(`
    CREATE TABLE records (
      store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (store, id)
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const getSetting = (key, fallback = "") =>
    database.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? fallback;
  const setSetting = (key, value) => database.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
  const engine = createSyncEngine({
    database,
    getSetting,
    setSetting,
    stores: STORES,
    now: options.now,
    retention: options.retention,
    starterCatalog: options.starterCatalog,
  });
  engine.initialize();
  return { database, engine };
}

function active(device, store) {
  return device.database.prepare(
    "SELECT data FROM records WHERE store = ? AND deleted = 0 ORDER BY id"
  ).all(store).map((row) => JSON.parse(row.data));
}

test("OneDrive event packets merge, propagate tombstones, and create private backups", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "daily-intake-sync-"));
  const syncFolder = path.join(root, "OneDrive", "每日摄入同步");
  const desktop = testDevice(root, "desktop");
  const laptop = testDevice(root, "laptop");

  desktop.engine.localUpsert("foods", {
    id: "food-1", date: "2026-07-29", name: "测试米饭", calories: 174,
  });
  desktop.engine.localUpsert("baselineMultipliers", {
    id: "2026-07-29", date: "2026-07-29", multiplier: 1.26, recordedAt: "2026-07-29T08:00:00.000Z",
  });
  desktop.engine.localUpsert("profile", {
    id: "me", birthdate: "1990-01-01", sex: "male", height: 175,
  });
  desktop.engine.localUpsert("weights", {
    id: "2026-07-29", date: "2026-07-29", weight: 70.2, note: "同步测试",
  });
  desktop.engine.localUpsert("targetScenarios", {
    id: "2026-07-29", date: "2026-07-29", scenario: "strength", source: "manual",
  });
  desktop.engine.localUpsert("targetScenarioDefaults", {
    id: "2026-07-30", date: "2026-07-30", scenario: "cardio",
  });
  desktop.engine.localUpsert("energyTargetDefaults", {
    id: "2026-07-20", date: "2026-07-20", enabled: true, adjustment: -300,
  });
  desktop.engine.localUpsert("energyTargetDays", {
    id: "2026-07-29", date: "2026-07-29", enabled: true, adjustment: 0, source: "manual",
  });
  desktop.engine.configure({ syncFolder, syncEnabled: true });

  laptop.engine.configure({ syncFolder, syncEnabled: true });
  assert.equal(active(laptop, "foods")[0].name, "测试米饭");
  assert.equal(active(laptop, "baselineMultipliers")[0].multiplier, 1.26);
  assert.equal(active(laptop, "profile")[0].height, 175);
  assert.equal(active(laptop, "weights")[0].weight, 70.2);
  assert.equal(active(laptop, "targetScenarios")[0].scenario, "strength");
  assert.equal(active(laptop, "targetScenarioDefaults")[0].scenario, "cardio");
  assert.equal(active(laptop, "energyTargetDefaults")[0].adjustment, -300);
  assert.equal(active(laptop, "energyTargetDays")[0].adjustment, 0);

  laptop.engine.localUpsert("exercises", {
    id: "walk-1", date: "2026-07-29", name: "步行", steps: 6000, calories: 180,
  });
  desktop.engine.runSync();
  assert.equal(active(desktop, "exercises")[0].steps, 6000);

  desktop.engine.localUpsert("exercises", {
    id: "walk-1", date: "2026-07-29", name: "步行", steps: 6000, calories: 190,
  });
  laptop.engine.localUpsert("exercises", {
    id: "walk-1", date: "2026-07-29", name: "步行", steps: 6000, calories: 200,
  });
  desktop.engine.runSync();
  laptop.engine.runSync();
  desktop.engine.runSync();
  assert.equal(active(desktop, "exercises")[0].calories, active(laptop, "exercises")[0].calories);
  assert.ok(desktop.engine.status().conflicts + laptop.engine.status().conflicts >= 1);

  desktop.engine.localDelete("foods", "food-1");
  laptop.engine.runSync();
  assert.equal(active(laptop, "foods").length, 0);

  const status = desktop.engine.createBackup();
  assert.equal(status.backupHealthy, true);
  assert.match(status.lastBackupFile, /OneDrive.+backups.+backup-.+\.json/i);
  const backup = readFileSync(status.lastBackupFile, "utf8");
  assert.doesNotMatch(backup, /api[_ -]?key|external_api_token|llm_api_key/i);
  assert.match(backup, /"steps": 6000/);
  assert.match(backup, /"multiplier": 1.26/);
  assert.match(backup, /"weight": 70.2/);
  assert.match(backup, /"height": 175/);
  assert.match(backup, /"scenario": "strength"/);
  assert.match(backup, /"scenario": "cardio"/);
  assert.match(backup, /"adjustment": -300/);

  laptop.engine.localDelete("targetScenarios", "2026-07-29");
  desktop.engine.runSync();
  assert.equal(active(desktop, "targetScenarios").length, 0);

  const eventFiles = readdirSync(path.join(syncFolder, "events"), { recursive: true })
    .filter((name) => String(name).endsWith(".json"));
  assert.ok(eventFiles.length >= 3);
  assert.ok(desktop.engine.status().cloudSnapshotFiles >= 1);

  desktop.database.close();
  laptop.database.close();
});

test("verified full snapshots allow safe event cleanup and complete new-device restore", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "daily-intake-retention-"));
  const syncFolder = path.join(root, "CloudDrive", "每日摄入同步");
  let clock = "2026-01-01T08:00:00.000Z";
  const options = {
    now: () => clock,
    retention: {
      eventMinFiles: 2,
      eventMaxAgeDays: 30,
      backupMinFiles: 1,
      backupMaxAgeDays: 30,
      snapshotMinFiles: 1,
      snapshotMaxAgeDays: 180,
    },
  };
  const desktop = testDevice(root, "retention-desktop", options);
  for (let index = 1; index <= 5; index++) {
    desktop.engine.localUpsert("foods", {
      id: `food-${index}`, date: "2026-01-01", name: `食物 ${index}`, calories: 100 + index,
    });
  }
  desktop.engine.localUpsert("baselineMultipliers", {
    id: "2026-01-01", date: "2026-01-01", multiplier: 1.18, recordedAt: clock,
  });
  desktop.engine.localUpsert("profile", {
    id: "me", birthdate: "1988-05-01", sex: "female", height: 164,
  });
  desktop.engine.localUpsert("weights", {
    id: "2026-01-01", date: "2026-01-01", weight: 61.4, note: "",
  });
  desktop.engine.configure({ syncFolder, syncEnabled: true });
  desktop.engine.localDelete("foods", "food-5");

  clock = "2026-04-15T08:00:00.000Z";
  desktop.engine.exportFullToCloud();
  const remainingEvents = readdirSync(path.join(syncFolder, "events"), { recursive: true })
    .filter((name) => String(name).endsWith(".json"));
  assert.equal(remainingEvents.length, 2);
  assert.ok(desktop.engine.status().cloudSnapshotFiles >= 1);

  const newComputer = testDevice(root, "retention-new-computer", options);
  newComputer.engine.configure({ syncFolder, syncEnabled: true });
  assert.deepEqual(
    active(newComputer, "foods").map((item) => item.id),
    ["food-1", "food-2", "food-3", "food-4"],
  );
  assert.equal(
    newComputer.database.prepare(
      "SELECT deleted FROM records WHERE store = 'foods' AND id = 'food-5'"
    ).get().deleted,
    1,
  );
  assert.equal(active(newComputer, "baselineMultipliers")[0].multiplier, 1.18);
  assert.equal(active(newComputer, "profile")[0].height, 164);
  assert.equal(active(newComputer, "weights")[0].weight, 61.4);

  desktop.database.close();
  newComputer.database.close();
});

test("daily startup keeps a 30-day cloud snapshot and restores from it plus later events", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "daily-intake-snapshot-freshness-"));
  const syncFolder = path.join(root, "CloudDrive", "每日摄入同步");
  let clock = "2026-01-01T08:00:00.000Z";
  const options = {
    now: () => clock,
    retention: {
      snapshotFreshnessDays: 30,
      snapshotMinFiles: 3,
      snapshotMaxAgeDays: 180,
    },
  };
  const desktop = testDevice(root, "freshness-desktop", options);
  desktop.engine.localUpsert("foods", {
    id: "before-snapshot", date: "2026-01-01", name: "快照内记录", calories: 200,
  });
  desktop.engine.configure({ syncFolder, syncEnabled: true });
  const fullSnapshotNames = () => readdirSync(path.join(syncFolder, "snapshots"), { recursive: true })
    .filter((name) => /^full-.+\.json$/i.test(path.basename(String(name))));
  assert.equal(fullSnapshotNames().length, 1);
  assert.equal(desktop.engine.status().snapshotFreshnessDays, 30);

  desktop.engine.runSync();
  assert.equal(fullSnapshotNames().length, 1, "同一天重复启动或同步不能重复生成完整快照");
  clock = "2026-01-30T08:00:00.000Z";
  desktop.engine.runSync();
  assert.equal(fullSnapshotNames().length, 1, "30 天内已有完整快照时不应重复上传");

  clock = "2026-02-01T08:00:00.000Z";
  desktop.engine.runSync();
  assert.equal(fullSnapshotNames().length, 2, "云端完整快照超过 30 天后应自动补一份");
  assert.ok(readdirSync(path.join(syncFolder, "snapshots")).includes("latest.json"));

  clock = "2026-02-02T08:00:00.000Z";
  desktop.engine.localUpsert("foods", {
    id: "after-snapshot", date: "2026-02-02", name: "快照后的增量记录", calories: 300,
  });
  const newComputer = testDevice(root, "freshness-new-computer", options);
  newComputer.engine.configure({ syncFolder, syncEnabled: true });
  assert.deepEqual(
    active(newComputer, "foods").map((item) => item.id),
    ["after-snapshot", "before-snapshot"],
  );

  desktop.database.close();
  newComputer.database.close();
});

test("local backup export is current and import merges without clearing newer or unrelated records", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "daily-intake-local-backup-"));
  let sourceClock = "2026-07-01T08:00:00.000Z";
  const source = testDevice(root, "backup-source", { now: () => sourceClock });
  source.engine.localUpsert("foods", {
    id: "shared-food", date: "2026-07-01", name: "备份中的旧版本", calories: 300,
  });
  sourceClock = "2026-07-02T08:00:00.000Z";
  source.engine.localUpsert("weights", {
    id: "2026-07-02", date: "2026-07-02", weight: 68.5, note: "备份新增记录",
  });
  const backupFile = path.join(root, "manual-backup.json");
  const exported = source.engine.exportBackupFile(backupFile);
  assert.equal(exported.records, 3);
  const backup = JSON.parse(readFileSync(backupFile, "utf8"));
  assert.equal(backup.version, 5);
  assert.equal(backup.records.length, 3);
  assert.doesNotMatch(JSON.stringify(backup), /api[_ -]?key|llm_api_key/i);

  let targetClock = "2026-07-03T08:00:00.000Z";
  const target = testDevice(root, "backup-target", { now: () => targetClock });
  target.engine.localUpsert("foods", {
    id: "shared-food", date: "2026-07-01", name: "本机较新版本", calories: 330,
  });
  target.engine.localUpsert("foods", {
    id: "local-only", date: "2026-07-03", name: "本机独有记录", calories: 180,
  });
  const imported = target.engine.importBackupFile(backupFile);
  assert.equal(imported.imported, 2);
  assert.equal(imported.skipped, 1);
  assert.equal(active(target, "foods").find((item) => item.id === "shared-food").name, "本机较新版本");
  assert.equal(active(target, "foods").find((item) => item.id === "local-only").calories, 180);
  assert.equal(active(target, "weights")[0].weight, 68.5);

  source.database.close();
  target.database.close();
});

test('food library migration is idempotent and deletion and edits survive snapshots', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'food-library-sync-'));
  const a = testDevice(root, 'a');
  a.database.prepare("INSERT INTO records (store,id,data,updated_at) VALUES ('foods',?,?,?)").run('old', JSON.stringify({id:'old',name:'米饭',weight:350,calories:420,protein:10.5,date:'2020-01-01',time:'12:00'}), '2020-01-02T00:00:00.000Z');
  a.engine.initialize();
  let food = active(a,'foodLibrary')[0];
  assert.equal(food.calories,120); assert.equal(food.protein,3);
  assert.equal(food.createdAt,'2020-01-01T04:00:00.000Z');
  const count = a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n;
  a.engine.initialize(); a.engine.reconcileFoodLibrary();
  assert.equal(a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,count);
  a.engine.localUpsert('foodLibrary',{...food, name:'熟米饭', protein:4});
  a.engine.reconcileFoodLibrary(); assert.equal(active(a,'foodLibrary').length,1);
  const syncFolder = path.join(root,'OneDrive');
  a.engine.configure({syncFolder,syncEnabled:true});
  const b = testDevice(root,'b'); b.engine.configure({syncFolder,syncEnabled:true});
  assert.equal(active(b,'foodLibrary')[0].protein,4);
  assert.equal(active(b,'foodLibrary')[0].createdAt,food.createdAt);
  b.engine.localDelete('foodLibrary',food.id); b.engine.exportFullToCloud();
  a.engine.runSync(); a.engine.initialize();
  assert.equal(active(a,'foodLibrary').length,0);
  const c = testDevice(root,'c');c.engine.configure({syncFolder,syncEnabled:true});c.engine.initialize();
  assert.equal(active(c,'foodLibrary').length,0); assert.equal(active(c,'foods').length,1);
  a.engine.localUpsert('foods',{id:'invalid',name:'未知克重',weight:0,calories:10});
  assert.equal(active(a,'foodLibrary').length,0);
  a.database.close();b.database.close();c.database.close();
});

test('name cleanup is atomic, repeatable, and propagates canonical foods across devices', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'food-name-cleanup-'));
  const a = testDevice(root, 'a');
  const insert = a.database.prepare('INSERT INTO records(store,id,data,updated_at) VALUES (?,?,?,?)');
  for (const [id, weight] of [['rice300',300],['rice360',360]]) {
    insert.run('foods',id,JSON.stringify({id,name:`白米饭 (${weight}g)`,weight,calories:weight*1.2,protein:weight*.03,note:'原备注'}),'2026-08-01T00:00:00Z');
    insert.run('foodLibrary',`alias-${id}`,JSON.stringify({id:`alias-${id}`,name:`白米饭 (${weight}g)`,weight:100,calories:120,protein:3,note:'原备注',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-08-01T00:00:00Z'}),'2026-08-01T00:00:00Z');
  }
  a.engine.reconcileFoodLibrary();
  assert.equal(active(a,'foodLibrary').length,1);assert.equal(active(a,'foodLibrary')[0].name,'白米饭');
  const diets=active(a,'foods');assert.deepEqual(diets.map(x=>x.weight),[300,360]);assert.ok(diets.every(x=>x.note.includes('原备注')&&x.name==='白米饭'));
  const eventCount=a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n;
  a.engine.reconcileFoodLibrary();assert.equal(a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,eventCount);
  assert.throws(()=>a.engine.batchLocalChanges(()=>{a.engine.localUpsert('foods',{id:'rollback',name:'脆桃 (2个, 约280g)',weight:280,calories:100});throw Error('rollback');}));
  assert.equal(active(a,'foods').length,2);assert.equal(a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,eventCount);
  const syncFolder=path.join(root,'OneDrive');a.engine.configure({syncFolder,syncEnabled:true});a.engine.exportFullToCloud();
  const b=testDevice(root,'b');b.engine.configure({syncFolder,syncEnabled:true});
  assert.deepEqual(active(b,'foodLibrary'),active(a,'foodLibrary'));assert.deepEqual(active(b,'foods'),active(a,'foods'));
  b.engine.localUpsert('foods',{id:'new',name:'白米饭（200g）',weight:200,calories:240,note:'新备注'});b.engine.runSync();a.engine.runSync();
  assert.equal(active(a,'foodLibrary').length,1);assert.equal(active(a,'foods').find(x=>x.id==='new').name,'白米饭');
  a.database.close();b.database.close();
});

test('walking auto follows weight, manual stays locked, and LLM seeds only empty manual mode', async () => {
 const {applyWalkingPolicy,getWalkingContext}=await import('../electron/exercise-library-store.mjs');
 const root=mkdtempSync(path.join(os.tmpdir(),'walking-policy-'));const device=testDevice(root,'device');const {engine,database}=device;
 engine.localUpsert('profile',{id:'me',sex:'male'});engine.localUpsert('weights',{id:'2020-01-01',date:'2020-01-01',weight:70});
 assert.equal(getWalkingContext(database).caloriesPer1000,24.5);
 const value={id:'walk',name:'步行',date:'2026-01-01',steps:2000,calories:999,duration:20};
 assert.equal(applyWalkingPolicy(database,value,{allowSeed:true}).record.calories,49);
 engine.localUpsert('weights',{id:'2020-01-02',date:'2020-01-02',weight:80});assert.equal(getWalkingContext(database).caloriesPer1000,28);
 engine.localUpsert('walkingProfiles',{id:'walking:male',sex:'male',mode:'manual',manualCaloriesPer1000:33});
 const locked=JSON.stringify(active(device,'walkingProfiles').find(x=>x.sex==='male'));
 engine.localUpsert('weights',{id:'2020-01-03',date:'2020-01-03',weight:90});
 assert.equal(JSON.stringify(active(device,'walkingProfiles').find(x=>x.sex==='male')),locked);
 assert.equal(applyWalkingPolicy(database,value,{allowSeed:true}).record.calories,66);
 engine.localUpsert('walkingProfiles',{id:'walking:male',sex:'male',mode:'manual',manualCaloriesPer1000:null});
 assert.throws(()=>applyWalkingPolicy(database,value));
 const first=applyWalkingPolicy(database,{...value,calories:60},{allowSeed:true});assert.equal(first.seed.manualCaloriesPer1000,30);
 engine.batchLocalChanges(()=>{engine.localUpsert('walkingProfiles',first.seed);engine.localUpsert('exercises',first.record);});
 const later=applyWalkingPolicy(database,{...value,calories:999},{allowSeed:true});assert.equal(later.seed,null);assert.equal(later.record.calories,60);
 assert.throws(()=>applyWalkingPolicy(database,{...value,steps:0},{allowSeed:true}));
 database.close();
});
test('exercise library migration keeps history and syncs manual walking state and deletion',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'exercise-library-'));const a=testDevice(root,'a');
 a.engine.localUpsert('profile',{id:'me',sex:'female'});
 for(const [id,name,calories] of [['slow','8分配跑步10分钟',80],['fast','5分配跑步10分钟',130]])a.engine.localUpsert('exercises',{id,name,date:'2026-01-01',duration:10,calories,steps:1500,intensity:'高强度'});
 assert.equal(active(a,'exerciseLibrary').length,2);assert.equal(active(a,'exercises').find(x=>x.id==='slow').calories,80);assert.ok(active(a,'exerciseLibrary').every(x=>x.sex==='female'));
 const count=a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n;a.engine.reconcileExerciseLibrary();assert.equal(a.database.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n,count);
 a.engine.localUpsert('walkingProfiles',{id:'walking:female',sex:'female',mode:'manual',manualCaloriesPer1000:25});
 const folder=path.join(root,'OneDrive');a.engine.configure({syncFolder:folder,syncEnabled:true});a.engine.exportFullToCloud();
 const b=testDevice(root,'b');b.engine.configure({syncFolder:folder,syncEnabled:true});assert.deepEqual(active(b,'exerciseLibrary'),active(a,'exerciseLibrary'));
 assert.equal(active(b,'walkingProfiles').find(x=>x.sex==='female').manualCaloriesPer1000,25);
 const id=active(b,'exerciseLibrary')[0].id;b.engine.localDelete('exerciseLibrary',id);b.engine.runSync();a.engine.runSync();a.engine.reconcileExerciseLibrary();assert.equal(active(a,'exerciseLibrary').length,1);
 a.database.close();b.database.close();
});

test('starter catalog is repeatable and never overrides user edits or tombstones on fresh devices',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'catalog-sync-'));
 const a=testDevice(root,'a',{starterCatalog:STARTER_CATALOG});
 assert.equal(active(a,'foodLibrary').length,29);assert.equal(active(a,'exerciseLibrary').length,56);
 for(const item of active(a,'exerciseLibrary'))assert.equal(normalizeExerciseRecord(item).name,item.name);
 const food=active(a,'foodLibrary')[0],exercise=active(a,'exerciseLibrary')[0];
 const burger=active(a,'foodLibrary').find(x=>x.name.includes('麦当劳'));assert.ok(burger.note.includes('1个=155g'));
 a.engine.localUpsert('foodLibrary',{...food,calories:999});a.engine.localDelete('exerciseLibrary',exercise.id);
 const count=a.database.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;a.engine.initialize();assert.equal(a.database.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n,count);
 const syncFolder=path.join(root,'OneDrive');a.engine.configure({syncFolder,syncEnabled:true});a.engine.runSync();
 const b=testDevice(root,'b',{starterCatalog:STARTER_CATALOG});b.engine.configure({syncFolder,syncEnabled:true});b.engine.runSync();a.engine.runSync();
 assert.equal(active(b,'foodLibrary').find(x=>x.id===food.id).calories,999);assert.ok(!active(b,'exerciseLibrary').some(x=>x.id===exercise.id));
 b.engine.initialize();assert.ok(!active(b,'exerciseLibrary').some(x=>x.id===exercise.id));
});

test('legacy activity aliases merge latest library values and preserve every historical total',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'exercise-cleanup-')),d=testDevice(root,'d');
 const insert=d.database.prepare("INSERT INTO records(store,id,data,updated_at,deleted) VALUES(?,?,?,?,0)");
 const names=['健身房力量训练 · 中等强度 · MET4','健身房力量训练 无氧 · 中等强度 · MET5','力量训练 · 较低强度 · MET3'];
 for(let i=0;i<3;i++){
  insert.run('exerciseLibrary',`old-${i}`,JSON.stringify({id:`old-${i}`,name:names[i],sex:'male',intensity:i===2?'较低强度':'中等强度',caloriesPer10Minutes:40+i*10,createdAt:`2026-01-0${i+1}`,updatedAt:`2026-02-0${i+1}`,note:`MET${4+i}`}),`2026-02-0${i+1}`);
  insert.run('exercises',`history-${i}`,JSON.stringify({id:`history-${i}`,name:names[i],sex:'male',duration:30,calories:100+i,date:'2026-01-01',libraryId:`old-${i}`}),`2026-01-0${i+1}`);
 }
 d.engine.reconcileExerciseLibrary();const entries=active(d,'exerciseLibrary');assert.equal(entries.length,2);
 const moderate=entries.find(x=>x.name==='力量训练 · 中等强度');assert.equal(moderate.caloriesPer10Minutes,50);assert.equal(moderate.createdAt,'2026-01-01');assert.ok(moderate.note.includes('代谢当量4'));
 for(let i=0;i<3;i++){const row=active(d,'exercises').find(x=>x.id===`history-${i}`);assert.equal(row.calories,100+i);assert.equal(row.duration,30);assert.ok(entries.some(x=>x.id===row.libraryId));}
 const count=d.database.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;d.engine.reconcileExerciseLibrary();assert.equal(d.database.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n,count);
});

test('legacy preset portion migration remains older than remote user edits',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'serving-migration-sync-'));
 const oldCatalog=STARTER_CATALOG.map(item=>{const value={...item.value};for(const key of ['defaultServingGrams','servingSource','servingBasis','servingUpdatedAt'])delete value[key];return {...item,value};});
 const a=testDevice(root,'old',{starterCatalog:oldCatalog}),b=testDevice(root,'new',{starterCatalog:STARTER_CATALOG});
 const food=active(b,'foodLibrary')[0];b.engine.localUpsert('foodLibrary',{...food,defaultServingGrams:321,servingSource:'manual',servingUpdatedAt:new Date().toISOString()});
 const syncFolder=path.join(root,'cloud');b.engine.configure({syncFolder,syncEnabled:true});a.engine.configure({syncFolder,syncEnabled:true});a.engine.runSync();
 assert.equal(active(a,'foodLibrary').find(x=>x.id===food.id).defaultServingGrams,321);
 const other=active(a,'foodLibrary').find(x=>x.id!==food.id);assert.ok(other.defaultServingGrams>0);
});

test("food edits update normalized nutrition atomically, proportional weights preserve library corrections, and renames retain shared history",()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),"food-edit-")),a=testDevice(root,"a");
 let food={id:"meal",name:"测试食品",date:"2026-09-17",time:"12:00",weight:100,carbs:20,calories:100};
 a.engine.localUpsert("foods",food);
 let lib=active(a,"foodLibrary")[0];a.engine.localUpsert("foodLibrary",{...lib,carbs:22});
 food={...food,weight:50,carbs:10,calories:50};a.engine.localUpsert("foods",food);
 assert.equal(active(a,"foodLibrary")[0].carbs,22);assert.equal(active(a,"foodLibrary")[0].defaultServingGrams,50);
 food={...food,carbs:15};a.engine.localUpsert("foods",food);assert.equal(active(a,"foodLibrary")[0].carbs,30);
 a.engine.localUpsert("foods",{...food,id:"other"});
 food={...food,name:"修改后的食品"};a.engine.localUpsert("foods",food);
 assert.deepEqual(active(a,"foodLibrary").map(x=>x.name).sort(),["修改后的食品","测试食品"].sort());
 a.engine.localUpsert("foods",{...food,name:"再次改名"});
 assert.ok(!active(a,"foodLibrary").some(x=>x.name==="修改后的食品"));
 const snapshot=JSON.stringify(active(a,"foods")),libs=JSON.stringify(active(a,"foodLibrary"));
 assert.throws(()=>a.engine.batchLocalChanges(()=>{a.engine.localUpsert("foods",{...food,carbs:99});throw Error("abort");}));
 assert.equal(JSON.stringify(active(a,"foods")),snapshot);assert.equal(JSON.stringify(active(a,"foodLibrary")),libs);
 const folder=path.join(root,"cloud");a.engine.configure({syncEnabled:true,syncFolder:folder});a.engine.runSync();
 const b=testDevice(root,"b");b.engine.configure({syncEnabled:true,syncFolder:folder});b.engine.runSync();
 assert.deepEqual(active(b,"foodLibrary"),active(a,"foodLibrary"));a.database.close();b.database.close();
});
