# ARCHITECTURE — 图库插件

> 目标：让接手者在不读全部源码的情况下理解数据流与性能边界。

## 1. 组件树

```text
GalleryViewer
├── Toolbar / 筛选栏
├── GalleryGrid            网格 + 分组
│   └── ImageCard          缩略图/星级/选择
├── GalleryTimeline        按日期时间线
├── GalleryMap             地点相册（MapView）
├── GalleryTrack           轨迹视图（MapView）
├── MiniMap                迷你地图区域筛选
├── Lightbox               大图 / 缩放 / 旋转 / 全屏
└── EXIF 高级筛选面板
```

## 2. 启动数据流

```text
project:open
  → 读取 .projmeta.json
  → 迁移旧 ratings → metas
  → kmgr.listDirectory(projPath, true)
  → flattenImages（过滤图片扩展名 / 相对路径 / 分组键）
  → 合并 metas
  → 读取 cover
  → setImages / setConfig
```

图片 URL：

```ts
convertFileSrc(absolutePath)
```

不要用 `file://`；asset scope 由宿主维护。

## 3. 筛选管道

每次渲染按顺序：

```text
images
→ filterBySearch(名称/标签)
→ filterByRating(minRating)
→ filterByDateRange(dateRange)
→ filterByExif(exifFilter, metas)
→ filterByBBox(regionBBox, geoPoints)
→ sortImages(sortBy, sortDir, metas)
→ 分组（folder/date）
```

所有筛选函数在 `utils.ts`，应保持纯函数、可单测。

## 4. 配置持久化

- 用户操作 → `updateConfig` → 500ms 防抖 → 写 `.projmeta.json`
- 写回时保留通用字段，只替换 `gallery` 段
- `updatedAt` 每次写回更新
- 组件卸载/项目切换时 flush 未落盘定时器（待确认；当前为防抖）
- 不要在拖拽/滑块每一帧写盘

## 5. EXIF 与 GPS

- `exifService.ts`：读取 EXIF，缓存到 `metas[relPath].exif`
- 批量回填有进度与取消；失败图不阻塞
- `geoService.ts`：解析 GPS 坐标
- `useGeoIndex.ts`：建立 `path → lat/lng` 索引，供地图/轨迹/迷你地图使用
- 大目录回填应分批，避免长时间占用主线程

## 6. 地图 / 轨迹

- `map-core` 由宿主提供；`MapView` 负责渲染
- 在线底图状态在 `useMapBasemap` / `ONLINE_BASEMAP_STORAGE_KEY`
- 地点相册：按 GPS 聚合；轨迹：按拍摄时间排序连线
- 无 GPS 的图片不进入地图/轨迹，但仍在网格

## 7. 多选与灯箱

- `selection: Set<relPath>`
- Shift 范围选、Ctrl/Cmd 切换、普通点击进入多选模式
- 灯箱索引基于 `filteredImages`，筛选变化时需收敛索引
- 批量操作（星级/标签/封面）应一次写回

## 8. 性能边界

- 网格必须虚拟化/分页；不要一次渲染几千张 `<img>`
- 缩略图使用 `asset://`，避免 base64
- EXIF/GPS 解析异步、可取消
- 大 `.projmeta.json` 写入防抖；避免每张图一次写盘
- 地图 marker 过多时聚合/抽样

## 9. 关键不变量

1. `relPath` 是 POSIX 相对路径，跨 Windows/宿主稳定。
2. `metas` 只存用户操作或解析结果，不写空对象。
3. 所有配置写回保留 `id/type/title/createdAt`。
4. 多实例按 `containerId` 隔离，不共享 selection。
5. 筛选/排序不修改原数组。
