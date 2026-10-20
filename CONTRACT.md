# CONTRACT — 图库插件与 GeWu 宿主契约

> 适用宿主：GeWu 0.32.0+；建议 0.36.3+。  
> 本文只列图库用到的契约，完整字段见官网 [插件开发文档](https://li360.github.io/gewu-site/plugin-development/)。

## 1. manifest

```json
{
  "id": "plugin-gallery-viewer",
  "name": "图库视图",
  "version": "0.6.0",
  "minAppVersion": "0.32.0",
  "capabilities": ["kmgr:read", "kmgr:write"],
  "handles": ["project:open"],
  "projectTypes": ["gallery"],
  "isEditor": false,
  "layoutHints": { "preferredWeight": 1 }
}
```

- `projectTypes: ["gallery"]` 让「新建项目」出现图库类型
- 不是编辑器：不声明 `preferredExtensions`，不接收文件预加载
- `capabilities` 只是声明，不是强制安全边界；仍按最小权限使用

## 2. 项目目录

```text
我的图库.proj/
├── .projmeta.json
├── cover.jpg
├── 2024/旅行/a.jpg
└── 2024/旅行/b.jpg
```

`.projmeta.json` 通用字段：

```json
{
  "id": "proj-xxxx",
  "version": 1,
  "type": "gallery",
  "title": "我的图库",
  "createdAt": "2026-10-21T00:00:00.000Z",
  "updatedAt": "2026-10-21T00:00:00.000Z",
  "viewPlugin": "plugin-gallery-viewer",
  "gallery": {}
}
```

- `viewPlugin` 可选：显式指定视图插件；缺省按 `type` 路由
- `gallery` 段完全由图库插件定义，宿主原样透传
- 图片路径一律使用相对 `.proj` 根的 POSIX 路径（如 `2024/旅行/a.jpg`）

### gallery 配置

```ts
interface GalleryConfig {
  cover?: string
  metas?: Record<string, ImageMeta>
  groupBy?: "folder" | "date" | "none"
  include?: string[]
  exclude?: string[]
  thumbnailSize?: "sm" | "md" | "lg" | "xl"
  sortBy?: "name" | "modified" | "size" | "rating"
  sortDir?: "asc" | "desc"
  minRating?: number
  viewMode?: "grid" | "map" | "timeline" | "track"
  gridGrouping?: "folder" | "date"
  dateRange?: { from?: string; to?: string }
  exifFilter?: ExifFilter
}
```

`ImageMeta` 包含 `rating` / `tags` / `customOrder` / `exif`，以及预留的 AI 字段。
旧版 `ratings` 字段只在加载时迁移，不写回。

## 3. 事件

```ts
on<ProjectOpenPayload>("project:open", (payload) => {
  if (!shouldHandle(payload)) return
  // payload.path  .proj 绝对路径
  // payload.meta  已解析的 .projmeta.json
})
```

- 必须使用 `createMultiInstanceFilter(containerId)`
- 事件由 workspace 在新视图挂载后延迟投递；0.36.2+ 有 pending 重放
- 切换项目/关闭容器时释放 EXIF/GPS 任务

## 4. 宿主 API

| API | 用途 |
|-----|------|
| `kmgr.listDirectory(path, true)` | 递归扫描图片 |
| `kmgr.readTextFile` / `writeTextFile` | 读写 `.projmeta.json` |
| `kmgr.getFile` / `listFiles` | 可选，按需 |
| `convertFileSrc(path)` | 图片以 `asset://` 加载 |
| `emit("toast:show")` | 用户反馈 |
| `emit("gallery:cover-changed")` / `gallery:rating-changed` | 其他插件可监听 |

不要直接 `invoke`；不要读写 vault / 凭据 / 项目根以外的路径。

## 5. 地图能力

- `map-core` 由宿主提供（`MapView` / `useMapArchives` / 在线底图键）
- 打包时 `map-core` 必须 external
- 底图/地图归档路径由宿主管理；插件不硬编码
- EXIF GPS 坐标由 `geoService` 解析，失败时跳过，不影响网格

## 6. 兼容性

- 最低 0.32.0；0.36.3+ 推荐（项目视图首开修复、主页入口、社区更新回退）
- 若使用 `project:open` pending 重放，必须兼容旧版“直接 emit”路径
- 不依赖 `documentTypes`（当前仍以 `projectTypes` 为准）

## 7. 安全

- 不读取用户未选中的目录
- 不把图片上传到网络；在线底图仅请求瓦片
- 不在日志输出绝对路径中的敏感信息
- 不执行页面/文件内容中的脚本
