import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSyncEngine } from "../electron/sync-engine.mjs";

const syncFolder = process.argv[2];
if (!syncFolder) throw new Error("Missing sync folder");

const temporary = mkdtempSync(path.join(os.tmpdir(), "daily-intake-cloud-check-"));
const database = new DatabaseSync(path.join(temporary, "check.sqlite"));
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
  stores: ["foods", "exercises", "profile", "weights"],
});
engine.initialize();
engine.localUpsert("foods", {
  id: "cloud-folder-validation",
  date: "2026-07-29",
  name: "同步功能验证记录",
  calories: 0,
});
engine.localDelete("foods", "cloud-folder-validation");
const status = engine.configure({ syncFolder, syncEnabled: true });
console.log(JSON.stringify(status));
database.close();
