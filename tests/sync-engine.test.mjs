import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSyncEngine } from "../electron/sync-engine.mjs";

const STORES = [
  "foods", "exercises", "profile", "weights", "baselineMultipliers",
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
  assert.equal(exported.records, 2);
  const backup = JSON.parse(readFileSync(backupFile, "utf8"));
  assert.equal(backup.version, 5);
  assert.equal(backup.records.length, 2);
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
  assert.equal(imported.imported, 1);
  assert.equal(imported.skipped, 1);
  assert.equal(active(target, "foods").find((item) => item.id === "shared-food").name, "本机较新版本");
  assert.equal(active(target, "foods").find((item) => item.id === "local-only").calories, 180);
  assert.equal(active(target, "weights")[0].weight, 68.5);

  source.database.close();
  target.database.close();
});
