import { app, BrowserWindow, Menu } from "electron";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

if (process.platform !== "darwin") throw new Error("此检查必须在 macOS 上运行");

const root = path.resolve(import.meta.dirname, "..");
const profile = mkdtempSync(path.join(os.tmpdir(), "daily-intake-mac-"));
app.setPath("userData", profile);
app.setAppPath(root);
BrowserWindow.prototype.show = function () {};
setTimeout(() => app.exit(1), 60_000).unref();
let unexpectedQuit = false;
app.on("before-quit", (event) => {
  unexpectedQuit = true;
  event.preventDefault();
});

await import("../electron/main.mjs");

async function readyWindow(previous = null) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const window = BrowserWindow.getAllWindows().find((item) => item !== previous);
    if (window?.webContents.getURL().includes("?api=") && !window.webContents.isLoading()) return window;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("桌面窗口未能在 30 秒内加载");
}

try {
  const first = await readyWindow();
  if (!Menu.getApplicationMenu()) throw new Error("macOS 系统菜单未安装");
  const firstUrl = first.webContents.getURL();
  const api = new URL(firstUrl).searchParams.get("api");
  const created = await first.webContents.executeJavaScript(`fetch(${JSON.stringify(api + "/api/put")},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({store:"foods",value:{id:"mac-smoke-food",name:"Mac 测试食品",date:"2026-09-29",time:"12:00",weight:100,calories:100}})}).then(r=>r.ok)`);
  if (!created) throw new Error("无法写入本地记录");

  first.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (unexpectedQuit) throw new Error("关闭最后一个窗口使应用退出");
  app.emit("activate");
  const second = await readyWindow(first);
  if (new URL(second.webContents.getURL()).searchParams.get("api") !== api) throw new Error("重新打开时重复启动了本地服务");
  const restored = await second.webContents.executeJavaScript(`fetch(${JSON.stringify(api + "/api/data")}).then(r=>r.json()).then(d=>d.foods.some(x=>x.id==="mac-smoke-food"))`);
  if (!restored) throw new Error("重新打开后记录未保留");
  console.log("macOS 桌面启动、菜单、关闭后重新打开和本地记录检查通过");
  app.exit(0);
} catch (error) {
  console.error(error);
  console.error("Window URLs:", BrowserWindow.getAllWindows().map((window) => window.webContents.getURL()));
  const logFile = path.join(profile, "data", "desktop.log");
  if (existsSync(logFile)) console.error("Desktop log:\n" + readFileSync(logFile, "utf8"));
  app.exit(1);
}
