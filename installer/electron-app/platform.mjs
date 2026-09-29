import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Only suggest an existing cloud directory. The user still chooses whether to sync.
export function detectedOneDriveRoot({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  exists = existsSync,
  list = readdirSync,
} = {}) {
  const fromEnvironment = [env.OneDriveCommercial, env.OneDriveConsumer, env.OneDrive]
    .filter((candidate) => candidate && exists(candidate));
  if (fromEnvironment.length) return fromEnvironment[0];

  if (platform === "darwin") {
    const cloudStorage = path.join(home, "Library", "CloudStorage");
    if (exists(cloudStorage)) {
      try {
        const names = list(cloudStorage).filter((name) => /^OneDrive(?:-|$)/i.test(name)).sort();
        for (const name of names) {
          const candidate = path.join(cloudStorage, name);
          if (exists(candidate)) return candidate;
        }
      } catch {
        // A protected cloud directory should not prevent the app from starting.
      }
    }
    for (const candidate of [path.join(home, "OneDrive"), path.join(home, "OneDrive - Personal")]) {
      if (exists(candidate)) return candidate;
    }
  }

  return platform === "win32"
    ? env.OneDriveCommercial || env.OneDriveConsumer || env.OneDrive || ""
    : "";
}
