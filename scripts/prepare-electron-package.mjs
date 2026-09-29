import { cpSync, existsSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "electron");
const packageDir = path.join(root, "installer", "electron-app");
const dist = path.join(root, "dist");
const packagedDist = path.join(packageDir, "dist");

if (!existsSync(path.join(dist, "standalone", "server.js"))) {
  throw new Error("请先运行 pnpm build，生成 dist/standalone/server.js");
}

for (const name of readdirSync(source).filter((name) => name.endsWith(".mjs"))) {
  copyFileSync(path.join(source, name), path.join(packageDir, name));
}

// This exact path is a generated, git-ignored mirror inside the package directory.
if (path.dirname(packagedDist) !== packageDir) throw new Error("打包目录不在预期位置");
rmSync(packagedDist, { recursive: true, force: true });
cpSync(dist, packagedDist, { recursive: true });
console.log("已同步桌面入口模块和编译后的界面到 installer/electron-app");
