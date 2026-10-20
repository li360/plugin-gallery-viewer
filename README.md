# 图库视图插件（GeWu）

GeWu 的「图库」项目视图插件：网格浏览、灯箱、多选批量、排序筛选、EXIF、打星、封面、分组、地点相册、日期范围、迷你地图区域筛选、轨迹视图。

插件类型：**项目视图**（处理 `.proj` 中 `type: "gallery"` 的容器），不是编辑器。

## 交接先读

外部开发者 / Cursor 接手，请按顺序读：

1. [AGENTS.md](./AGENTS.md) — AI/开发者边界与硬约束
2. [CONTRACT.md](./CONTRACT.md) — manifest / 项目 meta / 事件 / API
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — 组件与数据流
4. [TESTING.md](./TESTING.md) — 手动验收矩阵
5. [RELEASE.md](./RELEASE.md) — 发布与 registry
6. [HANDOFF.md](./HANDOFF.md) — 当前版本、已知问题、下一步

通用插件文档：<https://li360.github.io/gewu-site/plugin-development/>

## 目录

```
src/
├── index.tsx            ← 插件入口与 manifest
├── GalleryViewer.tsx    ← 主视图
├── GalleryMap.tsx       ← 地图筛选
├── GalleryTrack.tsx     ← 轨迹视图
├── MiniMap.tsx
├── exifService.ts       ← EXIF 解析与缓存
└── geoService.ts        ← 地理坐标
build.mjs                ← esbuild 打包脚本
manifest.json            ← 插件清单（id/version/capabilities）
update.json              ← 自更新清单（发布用）
```

## 环境

- Node.js 18+
- 主仓库 `MyProj` 与当前仓库**同级**（`E:\GeWu\MyProj`）。`tsconfig.json` 通过 `../MyProj/packages/...` 引用 `plugin-protocol` / `kmgr-api` / `map-core` 的类型。

## 开发

```powershell
cd E:\GeWu\plugin-gallery-viewer
npm install              # npm 11 下 npm ci 可能因 @esbuild 平台包报 notsup
npm run typecheck        # tsc --noEmit
npm run build            # node build.mjs → dist/index.js + dist/manifest.json
```

把 `dist/` 里的两个文件打成 ZIP，在 GeWu「插件管理 → 手动安装」选择 ZIP 即可本地加载；或直接把产物放到 `%APPDATA%\com.gewu.desktop\plugins\plugin-gallery-viewer\` 后重启。

> React / plugin-protocol / kmgr-api / workspace / map-core 由宿主提供（esbuild `external`），不要打进产物，否则会出现双 React 实例。

## 发布

完整流程见 [RELEASE.md](./RELEASE.md)。一键发布：

```powershell
pwsh -NoProfile -File E:\GeWu\MyProj\scripts\publish-plugin.ps1 `
  -PluginPath E:\GeWu\plugin-gallery-viewer `
  -GitHubRepo li360/plugin-gallery-viewer `
  -PushRegistry
```

脚本会构建 ZIP、生成 `update.json`、发 GitHub Release，并更新社区 `registry.json`。

手工发布的最低要求：

1. `manifest.json` / `package.json` / `src/index.tsx` 版本一致
2. ZIP 根目录是 `index.js` + `manifest.json`
3. `update.json.checksum` 与 ZIP SHA256 一致
4. 先发 Release，再更新 registry

> 仓库根目录的 `gewu-plugin.zip` / `update.json` 是最近一次发布的副本；**发布前必须让两者与 `manifest.json` 版本一致**，否则自更新会显示旧版本。

## 测试

目前没有自动化单测。改动后至少验证：

- 新建/打开一个 gallery 项目，网格与灯箱正常
- 打星、设封面、排序筛选后刷新仍保留
- EXIF 日期/相机筛选生效
- 地图区域筛选与轨迹视图（需要带 GPS 的图片）
