import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_POINTER_NAME = "latest.json";
const DEFAULT_RETENTION = {
  eventMinFiles: 500,
  eventMaxAgeDays: 90,
  backupMinFiles: 7,
  backupMaxAgeDays: 90,
  snapshotMinFiles: 3,
  snapshotMaxAgeDays: 180,
  snapshotFreshnessDays: 30,
};

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function listJsonFiles(root) {
  if (!root || !existsSync(root)) return [];
  const result = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) result.push(target);
    }
  }
  return result;
}

function atomicJson(target, value) {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.partial`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  renameSync(temporary, target);
}

function addColumn(database, table, column, declaration) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
}

function normalizeFolder(folder) {
  return folder ? path.resolve(String(folder).trim()) : "";
}

function eventFileMetadata(file) {
  const name = path.basename(file, path.extname(file));
  const matched = name.match(/^(\d{13})__(.+)$/);
  return matched
    ? { eventId: matched[2], time: Number(matched[1]) }
    : { eventId: name, time: statSync(file).mtimeMs };
}

export function createSyncEngine({
  database,
  getSetting,
  setSetting,
  stores,
  log = () => {},
  now = () => new Date().toISOString(),
  retention = {},
}) {
  let timer;
  let running = false;
  const retentionPolicy = { ...DEFAULT_RETENTION, ...retention };

  function initialize() {
    addColumn(database, "records", "deleted", "INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "records", "sync_event_id", "TEXT NOT NULL DEFAULT ''");
    addColumn(database, "records", "sync_device", "TEXT NOT NULL DEFAULT ''");
    database.exec(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, written_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sync_applied (
        event_id TEXT PRIMARY KEY, applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_snapshots_applied (
        checksum TEXT PRIMARY KEY, applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store TEXT NOT NULL, record_id TEXT NOT NULL, local_event_id TEXT NOT NULL,
        remote_event_id TEXT NOT NULL, winner_event_id TEXT NOT NULL,
        local_data TEXT, remote_data TEXT, created_at TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0
      );
    `);
    if (!getSetting("sync_device_id")) setSetting("sync_device_id", randomUUID());
  }

  function detectedOneDriveRoot() {
    const candidates = [
      process.env.OneDriveCommercial,
      process.env.OneDriveConsumer,
      process.env.OneDrive,
    ].filter(Boolean);
    return candidates.find((candidate) => existsSync(candidate)) || candidates[0] || "";
  }

  function defaultFolder() {
    const root = detectedOneDriveRoot();
    return root ? path.join(root, "每日摄入同步") : "";
  }

  function folder() {
    return normalizeFolder(getSetting("sync_folder"));
  }

  function enabled() {
    return getSetting("sync_enabled", "false") === "true";
  }

  function ensureFolders() {
    const root = folder();
    if (!root) throw new Error("请先选择云盘同步文件夹");
    mkdirSync(path.join(root, "events"), { recursive: true });
    mkdirSync(path.join(root, "backups"), { recursive: true });
    mkdirSync(path.join(root, "snapshots"), { recursive: true });
    return root;
  }

  function snapshotDigest(payload) {
    return createHash("sha256").update(JSON.stringify({
      schemaVersion: payload.schemaVersion,
      kind: payload.kind,
      exportedAt: payload.exportedAt,
      deviceId: payload.deviceId,
      records: payload.records,
      appliedEventIds: payload.appliedEventIds,
    })).digest("hex");
  }

  function validSnapshot(payload) {
    return Boolean(
      payload
      && payload.schemaVersion === 1
      && payload.kind === "daily-intake-sync-snapshot"
      && Array.isArray(payload.records)
      && Array.isArray(payload.appliedEventIds)
      && payload.checksum
      && payload.checksum === snapshotDigest(payload)
    );
  }

  function snapshotFilePaths() {
    const root = folder();
    if (!root) return [];
    return listJsonFiles(path.join(root, "snapshots"))
      .filter((file) => path.basename(file).toLowerCase() !== SNAPSHOT_POINTER_NAME);
  }

  function snapshotPointerPath() {
    const root = folder();
    return root ? path.join(root, "snapshots", SNAPSHOT_POINTER_NAME) : "";
  }

  function snapshotPointer(payload, file) {
    const root = folder();
    return {
      schemaVersion: 1,
      kind: "daily-intake-sync-snapshot-pointer",
      exportedAt: payload.exportedAt,
      checksum: payload.checksum,
      relativePath: path.relative(path.join(root, "snapshots"), file).split(path.sep).join("/"),
    };
  }

  function latestSnapshot() {
    const root = folder();
    if (!root) return null;
    const snapshotsRoot = path.resolve(root, "snapshots");
    const candidates = snapshotFilePaths()
      .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
    const newestCandidateName = candidates[0] ? path.basename(candidates[0]) : "";
    const pointerFile = snapshotPointerPath();
    if (pointerFile && existsSync(pointerFile)) {
      const pointer = safeJson(readFileSync(pointerFile, "utf8"));
      const target = pointer?.relativePath
        ? path.resolve(snapshotsRoot, ...String(pointer.relativePath).split("/"))
        : "";
      const insideSnapshots = target
        && (target === snapshotsRoot || target.startsWith(`${snapshotsRoot}${path.sep}`));
      if (
        pointer?.kind === "daily-intake-sync-snapshot-pointer"
        && insideSnapshots
        && path.basename(target).toLowerCase() !== SNAPSHOT_POINTER_NAME
        && (!newestCandidateName || path.basename(target).localeCompare(newestCandidateName) >= 0)
        && existsSync(target)
      ) {
        const payload = safeJson(readFileSync(target, "utf8"));
        if (validSnapshot(payload) && payload.checksum === pointer.checksum) {
          return { file: target, payload };
        }
      }
    }
    for (const file of candidates) {
      const payload = safeJson(readFileSync(file, "utf8"));
      if (!validSnapshot(payload)) continue;
      atomicJson(pointerFile, snapshotPointer(payload, file));
      return { file, payload };
    }
    return null;
  }

  function enqueueEvent(operation, store, id, data, current) {
    const eventId = randomUUID();
    const requestedAt = now();
    const requestedTime = Date.parse(requestedAt);
    const currentTime = Date.parse(current?.updated_at || "");
    const createdAt = Number.isFinite(currentTime) && (!Number.isFinite(requestedTime) || requestedTime <= currentTime)
      ? new Date(currentTime + 1).toISOString()
      : requestedAt;
    const deviceId = getSetting("sync_device_id");
    const event = {
      schemaVersion: 1,
      eventId,
      deviceId,
      createdAt,
      updatedAt: createdAt,
      operation,
      store,
      recordId: String(id),
      baseEventId: current?.sync_event_id || "",
      data: operation === "upsert" ? data : null,
    };
    return { event, payload: JSON.stringify(event) };
  }

  function localUpsert(store, value) {
    if (!stores.includes(store) || !value || typeof value !== "object" || !value.id) {
      throw new Error("Invalid record");
    }
    const id = String(value.id);
    const current = database.prepare(
      "SELECT sync_event_id, updated_at FROM records WHERE store = ? AND id = ?"
    ).get(store, id);
    const { event, payload } = enqueueEvent("upsert", store, id, value, current);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO records (store, id, data, updated_at, deleted, sync_event_id, sync_device)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(store, id) DO UPDATE SET
          data = excluded.data, updated_at = excluded.updated_at, deleted = 0,
          sync_event_id = excluded.sync_event_id, sync_device = excluded.sync_device
      `).run(store, id, JSON.stringify(value), event.updatedAt, event.eventId, event.deviceId);
      database.prepare(
        "INSERT INTO sync_outbox (event_id, payload, written_at) VALUES (?, ?, NULL)"
      ).run(event.eventId, payload);
      database.prepare(
        "INSERT OR IGNORE INTO sync_applied (event_id, applied_at) VALUES (?, ?)"
      ).run(event.eventId, event.updatedAt);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    if (enabled()) flushOutbox();
  }

  function localDelete(store, id) {
    if (!stores.includes(store) || !id) throw new Error("Invalid record");
    const current = database.prepare(
      "SELECT data, sync_event_id, updated_at FROM records WHERE store = ? AND id = ?"
    ).get(store, String(id));
    if (!current) return;
    const { event, payload } = enqueueEvent("delete", store, id, null, current);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        UPDATE records SET updated_at = ?, deleted = 1, sync_event_id = ?, sync_device = ?
        WHERE store = ? AND id = ?
      `).run(event.updatedAt, event.eventId, event.deviceId, store, String(id));
      database.prepare(
        "INSERT INTO sync_outbox (event_id, payload, written_at) VALUES (?, ?, NULL)"
      ).run(event.eventId, payload);
      database.prepare(
        "INSERT OR IGNORE INTO sync_applied (event_id, applied_at) VALUES (?, ?)"
      ).run(event.eventId, event.updatedAt);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    if (enabled()) flushOutbox();
  }

  function flushOutbox() {
    if (!enabled()) return 0;
    const root = ensureFolders();
    const deviceId = getSetting("sync_device_id");
    const rows = database.prepare(
      "SELECT event_id, payload FROM sync_outbox WHERE written_at IS NULL ORDER BY rowid"
    ).all();
    const mark = database.prepare("UPDATE sync_outbox SET written_at = ? WHERE event_id = ?");
    let written = 0;
    for (const row of rows) {
      const event = JSON.parse(row.payload);
      const eventTime = Date.parse(event.updatedAt || event.createdAt || now());
      const sortableTime = Number.isFinite(eventTime) ? eventTime : Date.parse(now());
      const target = path.join(root, "events", deviceId, `${String(sortableTime).padStart(13, "0")}__${row.event_id}.json`);
      if (!existsSync(target)) atomicJson(target, event);
      mark.run(now(), row.event_id);
      written += 1;
    }
    return written;
  }

  function seedCurrentRecords() {
    const rows = database.prepare(
      "SELECT store, id, data, deleted, sync_event_id, updated_at FROM records"
    ).all();
    for (const row of rows) {
      const current = { sync_event_id: row.sync_event_id, updated_at: row.updated_at };
      const { event, payload } = enqueueEvent(
        row.deleted ? "delete" : "upsert",
        row.store,
        row.id,
        row.deleted ? null : JSON.parse(row.data),
        current,
      );
      database.prepare(`
        UPDATE records SET updated_at = ?, sync_event_id = ?, sync_device = ?
        WHERE store = ? AND id = ?
      `).run(event.updatedAt, event.eventId, event.deviceId, row.store, row.id);
      database.prepare(
        "INSERT OR IGNORE INTO sync_outbox (event_id, payload, written_at) VALUES (?, ?, NULL)"
      ).run(event.eventId, payload);
      database.prepare(
        "INSERT OR IGNORE INTO sync_applied (event_id, applied_at) VALUES (?, ?)"
      ).run(event.eventId, event.updatedAt);
    }
  }

  function recordConflict(event, current, incomingWins) {
    const duplicate = database.prepare(`
      SELECT 1 FROM sync_conflicts
      WHERE local_event_id = ? AND remote_event_id = ?
    `).get(current.sync_event_id, event.eventId);
    if (duplicate) return;
    database.prepare(`
      INSERT INTO sync_conflicts (
        store, record_id, local_event_id, remote_event_id, winner_event_id,
        local_data, remote_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.store,
      event.recordId,
      current.sync_event_id,
      event.eventId,
      incomingWins ? event.eventId : current.sync_event_id,
      current.data,
      event.data ? JSON.stringify(event.data) : null,
      now(),
    );
  }

  function applyEvent(event) {
    if (
      !event || event.schemaVersion !== 1 || !event.eventId || !event.deviceId
      || !stores.includes(event.store) || !event.recordId
      || !["upsert", "delete"].includes(event.operation)
    ) return false;
    if (database.prepare("SELECT 1 FROM sync_applied WHERE event_id = ?").get(event.eventId)) return false;
    const current = database.prepare(`
      SELECT data, updated_at, deleted, sync_event_id, sync_device
      FROM records WHERE store = ? AND id = ?
    `).get(event.store, String(event.recordId));
    const incomingRank = `${event.updatedAt || event.createdAt || ""}|${event.eventId}`;
    const currentRank = current ? `${current.updated_at || ""}|${current.sync_event_id || ""}` : "";
    const incomingWins = !current || incomingRank > currentRank;
    const concurrent = Boolean(
      current?.sync_event_id
      && current.sync_event_id !== event.baseEventId
      && current.sync_event_id !== event.eventId
      && current.sync_device !== event.deviceId
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      if (concurrent) recordConflict(event, current, incomingWins);
      if (incomingWins) {
        const data = event.operation === "upsert"
          ? JSON.stringify(event.data || {})
          : (current?.data || "{}");
        database.prepare(`
          INSERT INTO records (store, id, data, updated_at, deleted, sync_event_id, sync_device)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(store, id) DO UPDATE SET
            data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted,
            sync_event_id = excluded.sync_event_id, sync_device = excluded.sync_device
        `).run(
          event.store,
          String(event.recordId),
          data,
          event.updatedAt || event.createdAt || now(),
          event.operation === "delete" ? 1 : 0,
          event.eventId,
          event.deviceId,
        );
      }
      database.prepare(
        "INSERT INTO sync_applied (event_id, applied_at) VALUES (?, ?)"
      ).run(event.eventId, now());
      database.exec("COMMIT");
      return incomingWins;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function importEvents() {
    if (!enabled()) return 0;
    const root = ensureFolders();
    let imported = 0;
    for (const file of listJsonFiles(path.join(root, "events"))) {
      const fileEventId = eventFileMetadata(file).eventId;
      if (fileEventId && database.prepare(
        "SELECT 1 FROM sync_applied WHERE event_id = ?"
      ).get(fileEventId)) continue;
      const event = safeJson(readFileSync(file, "utf8"));
      if (event && applyEvent(event)) imported += 1;
    }
    return imported;
  }

  function fullSnapshotPayload() {
    const records = database.prepare(`
      SELECT store, id, data, updated_at, deleted, sync_event_id, sync_device
      FROM records ORDER BY store, id
    `).all().map((row) => ({
      store: row.store,
      id: row.id,
      data: safeJson(row.data) || {},
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted),
      syncEventId: row.sync_event_id,
      syncDevice: row.sync_device,
    }));
    const appliedEventIds = database.prepare(
      "SELECT event_id FROM sync_applied ORDER BY event_id"
    ).all().map((row) => row.event_id);
    const payload = {
      schemaVersion: 1,
      kind: "daily-intake-sync-snapshot",
      exportedAt: now(),
      deviceId: getSetting("sync_device_id"),
      records,
      appliedEventIds,
      privacy: "不包含 API 密钥、接口令牌、LLM 设置或聊天记录",
    };
    return { ...payload, checksum: snapshotDigest(payload) };
  }

  function writeFullSnapshot() {
    if (!enabled()) return null;
    const root = ensureFolders();
    const payload = fullSnapshotPayload();
    const safeTime = payload.exportedAt.replace(/[:.]/g, "-");
    const target = path.join(
      root,
      "snapshots",
      payload.deviceId,
      `full-${safeTime}.json`,
    );
    atomicJson(target, payload);
    const verified = safeJson(readFileSync(target, "utf8"));
    if (!validSnapshot(verified)) throw new Error("云端完整快照校验失败");
    atomicJson(snapshotPointerPath(), snapshotPointer(verified, target));
    setSetting("sync_last_full_export_at", payload.exportedAt);
    setSetting("sync_last_full_snapshot_file", target);
    return target;
  }

  function applySnapshot(payload) {
    if (!validSnapshot(payload)) return 0;
    if (database.prepare(
      "SELECT 1 FROM sync_snapshots_applied WHERE checksum = ?"
    ).get(payload.checksum)) return 0;
    const upsertRecord = database.prepare(`
      INSERT INTO records (store, id, data, updated_at, deleted, sync_event_id, sync_device)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store, id) DO UPDATE SET
        data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted,
        sync_event_id = excluded.sync_event_id, sync_device = excluded.sync_device
    `);
    const markEvent = database.prepare(
      "INSERT OR IGNORE INTO sync_applied (event_id, applied_at) VALUES (?, ?)"
    );
    let imported = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const record of payload.records) {
        if (!record || !stores.includes(record.store) || !record.id) continue;
        const current = database.prepare(`
          SELECT updated_at, sync_event_id FROM records WHERE store = ? AND id = ?
        `).get(record.store, String(record.id));
        const incomingRank = `${record.updatedAt || ""}|${record.syncEventId || ""}`;
        const currentRank = current ? `${current.updated_at || ""}|${current.sync_event_id || ""}` : "";
        if (!current || incomingRank > currentRank) {
          upsertRecord.run(
            record.store,
            String(record.id),
            JSON.stringify(record.data || {}),
            record.updatedAt || payload.exportedAt,
            record.deleted ? 1 : 0,
            String(record.syncEventId || ""),
            String(record.syncDevice || payload.deviceId || ""),
          );
          imported += 1;
        }
      }
      for (const eventId of payload.appliedEventIds) {
        if (eventId) markEvent.run(String(eventId), payload.exportedAt);
      }
      database.prepare(
        "INSERT INTO sync_snapshots_applied (checksum, applied_at) VALUES (?, ?)"
      ).run(payload.checksum, now());
      database.exec("COMMIT");
      return imported;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function importLatestSnapshot(item = latestSnapshot()) {
    if (!enabled()) return 0;
    ensureFolders();
    const imported = item ? applySnapshot(item.payload) : 0;
    if (imported) setSetting("sync_last_full_import_at", now());
    return imported;
  }

  function ensureFreshCloudSnapshot(item = latestSnapshot()) {
    const checkedDay = String(now()).slice(0, 10);
    if (getSetting("sync_snapshot_freshness_checked_day") === checkedDay) {
      return { item, created: null };
    }
    const exportedTime = Date.parse(item?.payload?.exportedAt || "");
    const currentTime = Date.parse(now());
    const stale = !Number.isFinite(exportedTime)
      || !Number.isFinite(currentTime)
      || currentTime - exportedTime >= retentionPolicy.snapshotFreshnessDays * DAY_MS;
    const created = stale ? writeFullSnapshot() : null;
    const latest = created ? latestSnapshot() : item;
    setSetting("sync_snapshot_freshness_checked_day", checkedDay);
    setSetting("sync_snapshot_freshness_checked_at", now());
    return { item: latest, created };
  }

  function backupPayload() {
    const data = Object.fromEntries(stores.map((store) => [store, []]));
    const rows = database.prepare(
      "SELECT store, id, data, updated_at, sync_event_id, sync_device FROM records WHERE deleted = 0 ORDER BY updated_at"
    ).all();
    const records = rows.map((row) => {
      const value = JSON.parse(row.data);
      data[row.store].push(value);
      return {
        store: row.store,
        id: row.id,
        data: value,
        updatedAt: row.updated_at,
        syncEventId: row.sync_event_id,
        syncDevice: row.sync_device,
      };
    });
    return {
      version: 5,
      kind: "daily-intake-full-backup",
      exportedAt: now(),
      deviceId: getSetting("sync_device_id"),
      data,
      records,
      privacy: "不包含 API 密钥、接口令牌、LLM 设置或聊天记录",
    };
  }

  function exportBackupFile(target) {
    if (!target) throw new Error("未选择备份保存位置");
    const payload = backupPayload();
    atomicJson(target, payload);
    const verified = safeJson(readFileSync(target, "utf8"));
    if (!verified || verified.kind !== "daily-intake-full-backup" || !Array.isArray(verified.records)) {
      throw new Error("本地完整备份校验失败");
    }
    setSetting("local_backup_last_file", target);
    setSetting("local_backup_last_export_at", payload.exportedAt);
    return { file: target, exportedAt: payload.exportedAt, records: payload.records.length };
  }

  function importBackupFile(source) {
    if (!source || !existsSync(source)) throw new Error("未找到所选备份文件");
    const payload = safeJson(readFileSync(source, "utf8"));
    if (!payload || typeof payload !== "object") throw new Error("备份文件不是有效的 JSON");
    const fallbackUpdatedAt = Number.isFinite(Date.parse(payload.exportedAt))
      ? payload.exportedAt
      : now();
    const candidates = [];
    if (Array.isArray(payload.records)) {
      for (const record of payload.records) {
        if (!record || !stores.includes(record.store) || !record.id || !record.data) continue;
        candidates.push({
          store: record.store,
          id: String(record.id),
          data: { ...record.data, id: String(record.id) },
          updatedAt: record.updatedAt || fallbackUpdatedAt,
        });
      }
    } else {
      const legacyData = payload.data && typeof payload.data === "object" ? payload.data : payload;
      for (const store of stores) {
        const raw = legacyData[store];
        const values = Array.isArray(raw) ? raw : raw && store === "profile" ? [raw] : [];
        for (const value of values) {
          if (!value || typeof value !== "object" || !value.id) continue;
          candidates.push({
            store,
            id: String(value.id),
            data: { ...value, id: String(value.id) },
            updatedAt: fallbackUpdatedAt,
          });
        }
      }
    }
    if (!candidates.length) throw new Error("备份中没有可识别的记录");
    let imported = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      const current = database.prepare(
        "SELECT updated_at FROM records WHERE store = ? AND id = ?"
      ).get(candidate.store, candidate.id);
      const incomingTime = Date.parse(candidate.updatedAt);
      const currentTime = current ? Date.parse(current.updated_at) : Number.NEGATIVE_INFINITY;
      if (current && Number.isFinite(currentTime) && Number.isFinite(incomingTime) && currentTime >= incomingTime) {
        skipped += 1;
        continue;
      }
      localUpsert(candidate.store, candidate.data);
      imported += 1;
    }
    setSetting("local_backup_last_import_file", source);
    setSetting("local_backup_last_import_at", now());
    return { file: source, imported, skipped, total: candidates.length };
  }

  function createBackup(force = false) {
    if (!enabled()) return null;
    const root = ensureFolders();
    const lastBackupAt = getSetting("sync_last_backup_at");
    if (!force && lastBackupAt && Date.now() - Date.parse(lastBackupAt) < DAY_MS) return null;
    const payload = backupPayload();
    const safeTime = payload.exportedAt.replace(/[:.]/g, "-");
    const target = path.join(
      root,
      "backups",
      getSetting("sync_device_id"),
      `backup-${safeTime}.json`,
    );
    atomicJson(target, payload);
    const verified = safeJson(readFileSync(target, "utf8"));
    if (!verified || verified.kind !== "daily-intake-full-backup") {
      throw new Error("完整备份校验失败");
    }
    setSetting("sync_last_backup_at", payload.exportedAt);
    setSetting("sync_last_backup_file", target);
    return target;
  }

  function fileTimestamp(file, declaredAt = "") {
    const parsed = Date.parse(declaredAt);
    if (Number.isFinite(parsed)) return parsed;
    return statSync(file).mtimeMs;
  }

  function removeOldFiles(items, minFiles, maxAgeDays) {
    const cutoff = Date.parse(now()) - maxAgeDays * DAY_MS;
    const sorted = [...items].sort((a, b) => a.time - b.time);
    const removable = Math.max(0, sorted.length - minFiles);
    let removed = 0;
    for (const item of sorted) {
      if (removed >= removable || item.time >= cutoff) continue;
      unlinkSync(item.file);
      removed += 1;
    }
    return removed;
  }

  function cleanupCloudFiles(newestSnapshotItem = latestSnapshot()) {
    if (!enabled()) return { events: 0, backups: 0, snapshots: 0 };
    const root = ensureFolders();
    const newestSnapshot = newestSnapshotItem?.payload;
    let removedEvents = 0;
    if (newestSnapshot) {
      const covered = new Set(newestSnapshot.appliedEventIds.map(String));
      const cutoff = Date.parse(now()) - retentionPolicy.eventMaxAgeDays * DAY_MS;
      const eventFiles = listJsonFiles(path.join(root, "events")).map((file) => ({
        file,
        ...eventFileMetadata(file),
      }));
      const removable = Math.max(0, eventFiles.length - retentionPolicy.eventMinFiles);
      const candidates = eventFiles
        .filter((item) =>
          item.eventId
          && covered.has(String(item.eventId))
          && item.time < cutoff
          && Date.parse(newestSnapshot.exportedAt) >= item.time
        )
        .sort((a, b) => a.time - b.time)
        .slice(0, removable);
      for (const item of candidates) {
        unlinkSync(item.file);
        removedEvents += 1;
      }
    }

    const backupItems = listJsonFiles(path.join(root, "backups")).map((file) => {
      const payload = safeJson(readFileSync(file, "utf8"));
      return { file, time: fileTimestamp(file, payload?.exportedAt) };
    });
    const removedBackups = removeOldFiles(
      backupItems,
      retentionPolicy.backupMinFiles,
      retentionPolicy.backupMaxAgeDays,
    );
    const snapshotItems = snapshotFilePaths().map((file) => ({
      file,
      time: file === newestSnapshotItem?.file
        ? fileTimestamp(file, newestSnapshot?.exportedAt)
        : statSync(file).mtimeMs,
    }));
    const removedSnapshots = removeOldFiles(
      snapshotItems,
      retentionPolicy.snapshotMinFiles,
      retentionPolicy.snapshotMaxAgeDays,
    );
    const result = { events: removedEvents, backups: removedBackups, snapshots: removedSnapshots };
    setSetting("sync_last_cleanup_at", now());
    setSetting("sync_last_cleanup_result", JSON.stringify(result));
    return result;
  }

  function runSync({ forceBackup = false } = {}) {
    if (running || !enabled()) return status();
    running = true;
    try {
      flushOutbox();
      let newestSnapshotItem = latestSnapshot();
      const importedSnapshots = importLatestSnapshot(newestSnapshotItem);
      const importedEvents = importEvents();
      const backup = createBackup(forceBackup);
      const freshness = ensureFreshCloudSnapshot(newestSnapshotItem);
      newestSnapshotItem = freshness.item;
      const cleanup = cleanupCloudFiles(newestSnapshotItem);
      setSetting("sync_last_at", now());
      setSetting("sync_last_error", "");
      setSetting("sync_last_imported", String(importedSnapshots + importedEvents));
      setSetting("sync_last_cleanup_result", JSON.stringify(cleanup));
      if (backup) log(`OneDrive backup created: ${backup}`);
      if (freshness.created) log(`Fresh cloud snapshot created: ${freshness.created}`);
    } catch (error) {
      setSetting("sync_last_error", error.message || String(error));
      log(`OneDrive sync error: ${error.stack || error}`);
    } finally {
      running = false;
    }
    return status();
  }

  function exportFullToCloud() {
    if (!enabled()) throw new Error("请先开启云盘同步");
    flushOutbox();
    importLatestSnapshot();
    importEvents();
    const target = writeFullSnapshot();
    const latest = latestSnapshot();
    cleanupCloudFiles(latest);
    setSetting("sync_snapshot_freshness_checked_day", String(now()).slice(0, 10));
    setSetting("sync_snapshot_freshness_checked_at", now());
    setSetting("sync_last_at", now());
    setSetting("sync_last_error", "");
    log(`Full cloud snapshot created: ${target}`);
    return status();
  }

  function importAllFromCloud() {
    if (!enabled()) throw new Error("请先开启云盘同步");
    const importedSnapshots = importLatestSnapshot();
    const importedEvents = importEvents();
    flushOutbox();
    setSetting("sync_last_full_import_at", now());
    setSetting("sync_last_imported", String(importedSnapshots + importedEvents));
    setSetting("sync_last_at", now());
    setSetting("sync_last_error", "");
    return status();
  }

  function configure({ syncFolder, syncEnabled }) {
    const nextFolder = normalizeFolder(syncFolder || folder() || defaultFolder());
    const wasFolder = folder();
    if (syncEnabled && !nextFolder) throw new Error("没有检测到 OneDrive，请手动选择同步文件夹");
    if (nextFolder) {
      if (syncEnabled) mkdirSync(nextFolder, { recursive: true });
      setSetting("sync_folder", nextFolder);
    }
    setSetting("sync_enabled", String(Boolean(syncEnabled)));
    if (syncEnabled) {
      ensureFolders();
      if (getSetting("sync_seeded_folder") !== nextFolder || wasFolder !== nextFolder) {
        seedCurrentRecords();
        setSetting("sync_seeded_folder", nextFolder);
      }
      return runSync({ forceBackup: !getSetting("sync_last_backup_at") });
    }
    return status();
  }

  function status() {
    const root = folder();
    const oneDriveRoot = detectedOneDriveRoot();
    const pending = database.prepare(
      "SELECT COUNT(*) AS count FROM sync_outbox WHERE written_at IS NULL"
    ).get().count;
    const conflicts = database.prepare(
      "SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved = 0"
    ).get().count;
    let backupHealthy = false;
    const lastBackupFile = getSetting("sync_last_backup_file");
    if (enabled() && lastBackupFile && existsSync(lastBackupFile)) {
      const backup = safeJson(readFileSync(lastBackupFile, "utf8"));
      backupHealthy = backup?.kind === "daily-intake-full-backup";
    }
    const cleanup = safeJson(getSetting("sync_last_cleanup_result", "{}")) || {};
    const cloudEventFiles = enabled() && root ? listJsonFiles(path.join(root, "events")).length : 0;
    const cloudBackupFiles = enabled() && root ? listJsonFiles(path.join(root, "backups")).length : 0;
    const cloudSnapshotFiles = enabled() && root ? snapshotFilePaths().length : 0;
    return {
      enabled: enabled(),
      folder: root,
      detectedOneDriveRoot: oneDriveRoot,
      suggestedFolder: defaultFolder(),
      insideDetectedOneDrive: Boolean(
        root && oneDriveRoot && path.relative(oneDriveRoot, root).split(path.sep)[0] !== ".."
      ),
      deviceId: getSetting("sync_device_id"),
      lastSyncAt: getSetting("sync_last_at"),
      lastBackupAt: getSetting("sync_last_backup_at"),
      lastBackupFile,
      lastError: getSetting("sync_last_error"),
      lastImported: Number(getSetting("sync_last_imported", "0")) || 0,
      pending: Number(pending) || 0,
      conflicts: Number(conflicts) || 0,
      backupHealthy,
      lastFullExportAt: getSetting("sync_last_full_export_at"),
      lastFullImportAt: getSetting("sync_last_full_import_at"),
      lastCleanupAt: getSetting("sync_last_cleanup_at"),
      lastCleanupRemoved: Number(cleanup.events || 0) + Number(cleanup.backups || 0) + Number(cleanup.snapshots || 0),
      cloudEventFiles,
      cloudBackupFiles,
      cloudSnapshotFiles,
      retentionEventMinFiles: retentionPolicy.eventMinFiles,
      retentionEventMaxAgeDays: retentionPolicy.eventMaxAgeDays,
      snapshotFreshnessDays: retentionPolicy.snapshotFreshnessDays,
      snapshotFreshnessCheckedAt: getSetting("sync_snapshot_freshness_checked_at"),
    };
  }

  function conflictList() {
    return database.prepare(`
      SELECT id, store, record_id AS recordId, winner_event_id AS winnerEventId,
             created_at AS createdAt, resolved
      FROM sync_conflicts ORDER BY id DESC LIMIT 50
    `).all();
  }

  function start() {
    stop();
    if (enabled()) runSync();
    timer = setInterval(() => runSync(), 60_000);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  return {
    initialize,
    localUpsert,
    localDelete,
    configure,
    runSync,
    createBackup: () => runSync({ forceBackup: true }),
    exportBackupFile,
    importBackupFile,
    exportFullToCloud,
    importAllFromCloud,
    cleanupCloudFiles,
    status,
    conflictList,
    defaultFolder,
    start,
    stop,
  };
}
