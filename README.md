# 图库视图插件（GeWu）

GeWu 的「图库」项目视图插件：网格浏览、灯箱、多选批量、排序筛选、EXIF、打星、封面、分组、地点相册、日期范围、迷你地图区域筛选、轨迹视图。

插件类型：**项目视图**（处理 `.proj` 中 `type: "gallery"` 的容器），不是编辑器。

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
npm ci
npm run typecheck        # tsc --noEmit
npm run build            # node build.mjs → dist/index.js + dist/manifest.json
```

把 `dist/` 里的两个文件打成 ZIP，在 GeWu「插件管理 → 手动安装」选择 ZIP 即可本地加载；或直接把产物放到 `%APPDATA%\com.gewu.desktop\plugins\plugin-gallery-viewer\` 后重启。

> React / plugin-protocol / kmgr-api / workspace / map-core 由宿主提供（esbuild `external`），不要打进产物，否则会出现双 React 实例。

## 发布

1. 同步版本号：`manifest.json` 的 `version` = `package.json` 的 `version`
2. 构建并打包（ZIP 根目录必须是 `index.js` + `manifest.json`）：

```powershell
npm run build
Compress-Archive -Path dist\index.js,dist\manifest.json -DestinationPath gewu-plugin.zip -Force
(Get-FileHash gewu-plugin.zip -Algorithm SHA256).Hash.ToLower()
```

3. 更新 `update.json`：

```json
{
  "id": "plugin-gallery-viewer",
  "name": "图库视图",
  "version": "0.6.0",
  "downloadUrl": "https://github.com/li360/plugin-gallery-viewer/releases/latest/download/gewu-plugin.zip",
  "checksum": "sha256:<ZIP 的 SHA256>",
  "minAppVersion": "0.32.0",
  "description": "……",
  "author": "GeWu Team",
  "capabilities": ["kmgr:read", "kmgr:write"],
  "notes": "本次更新说明"
}
```

4. 在 GitHub Release（latest）上传 `gewu-plugin.zip` 与 `update.json`
5. 在 GeWu「插件管理 → 检查更新」验证能识别新版本

> 仓库根目录的 `gewu-plugin.zip` / `update.json` 是最近一次发布的副本；**发布前必须让两者与 `manifest.json` 版本一致**，否则自更新会显示旧版本。

## 测试

目前没有自动化单测。改动后至少验证：

- 新建/打开一个 gallery 项目，网格与灯箱正常
- 打星、设封面、排序筛选后刷新仍保留
- EXIF 日期/相机筛选生效
- 地图区域筛选与轨迹视图（需要带 GPS 的图片）
