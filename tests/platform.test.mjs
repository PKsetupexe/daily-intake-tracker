import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectedOneDriveRoot } from "../electron/platform.mjs";

test("macOS suggests an existing OneDrive CloudStorage directory", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "intake-mac-home-"));
  const cloud = path.join(home, "Library", "CloudStorage");
  const oneDrive = path.join(cloud, "OneDrive-Personal");
  mkdirSync(oneDrive, { recursive: true });
  mkdirSync(path.join(cloud, "Dropbox"));
  assert.equal(detectedOneDriveRoot({ platform: "darwin", env: {}, home }), oneDrive);
});

test("macOS without OneDrive leaves sync opt-in and Windows retains its environment suggestion", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "intake-empty-home-"));
  assert.equal(detectedOneDriveRoot({ platform: "darwin", env: {}, home }), "");
  assert.equal(detectedOneDriveRoot({ platform: "win32", env: { OneDrive: "C:\\OneDrive" }, home }), "C:\\OneDrive");
});

test("unreadable macOS cloud directory does not block startup", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "intake-protected-home-"));
  mkdirSync(path.join(home, "Library", "CloudStorage"), { recursive: true });
  assert.equal(detectedOneDriveRoot({ platform: "darwin", env: {}, home, list: () => { throw new Error("denied"); } }), "");
});
