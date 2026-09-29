# macOS 移植与接力

桌面主进程已支持 macOS 的窗口关闭与重新激活、系统菜单和 OneDrive 本地目录建议。界面中的系统外观、代理及文件管理器文案也已通用化。食品、运动、SQLite 和增量同步仍使用与 Windows 相同的源码与数据格式。此仓库在 Windows 上开发；macOS 图形界面和安装包必须在 Mac 环境最终验证。

## 在 Mac 上构建

安装 Git、Node.js 22.13 或更新版本和 Xcode Command Line Tools。Apple 芯片使用 `arm64`；Intel Mac 使用 `x64`。打包器会按目标架构下载对应的 Electron，不复用开发电脑上的 Electron 二进制文件。

```sh
git clone https://github.com/PKsetupexe/daily-intake-tracker.git
cd daily-intake-tracker
npm ci
npm test
npm run desktop:prepare
npx electron-builder --projectDir installer/electron-app --mac dmg --arm64 --publish never
```

Intel Mac 将最后一行的 `--arm64` 改为 `--x64`。输出位于 `installer/electron-output-v3.6.0/`。`desktop:prepare` 会将 `electron/*.mjs` 和新编译的 `dist/` 复制到忽略的打包目录；修改桌面代码后需重新运行。`app-icon.png` 是 512×512 的 Mac 图标来源，由 electron-builder 转换。

仓库的 [macOS package 工作流](../.github/workflows/macos-package.yml) 在 `main` 更新后使用 macOS runner 分别运行 54 项项目测试，并构建 Apple 芯片和 Intel 的 DMG，作为 Actions artifact 保存。GitHub 托管的 macOS runner 上，Electron 测试进程未收到图形系统的 `ready` 事件，因此自动流程**无法证明桌面界面能正常启动**；必须在实际 Mac 登录会话中验收。该工作流没有签名凭据，产物仅供测试；直接下载运行可能受到 Gatekeeper 阻止。正式分发应在 macOS 上配置 Apple Developer 签名与公证，不要把证书、密码或 API Key 写入仓库。参阅 [Electron 官方签名说明](https://www.electronjs.org/docs/latest/tutorial/code-signing) 和 [electron-builder macOS 配置](https://www.electron.build/v26/docs/mac/)。

## Mac 上的验收

1. 在有图形登录会话的 Mac 上运行 `npx electron scripts/smoke-macos.mjs`，检查首次启动、系统菜单、关闭窗口后重新打开及本机记录。然后从 DMG 安装，手动确认点击 Dock 图标重新打开、浅色和深色模式、文件选择对话框都正常。
2. 新增饮食、运动、体重，重启后确认 SQLite 记录仍在。应用使用 Electron 的本机用户数据目录，不使用仓库根目录 `data/`。
3. 导出并导入本机 JSON 备份；验证公共预置食品和运动、编辑及删除操作。
4. 若使用 OneDrive，确认建议路径指向 `~/Library/CloudStorage/OneDrive-*` 中实际存在的目录；也可手动选择 Dropbox 等其他网盘目录。先在 Windows 端导出完整快照，再在 Mac 端导入并增量同步，最后回到 Windows 核对记录。两台设备应使用相同版本。
5. 在 Mac 上分别检查系统代理、直连和实际使用的模型接口。API Key、外部令牌、LLM 设置及聊天记录只保存在本机，需要重新配置。

Mac 首次构建或运行若失败，请保留构建日志、Mac 芯片类型、macOS 版本和失败步骤。不要附上个人数据库、API Key 或包含令牌的配置。
