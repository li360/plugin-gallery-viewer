/**
 * 图库主组件 — 接收 project:open 事件，管理图片加载 / 搜索 / 排序筛选 /
 * 灯箱 / 多选批量 / 配置读写
 *
 * 设计要点：
 *  - 配置加载时调用 migrateRatings 把旧 ratings 字段迁到 metas
 *  - 排序→星标筛选→搜索 三级管道用 useMemo 串联
 *  - 多选：Shift 范围选 / Ctrl(Cmd) 单选 / 多选模式下点击切换
 *  - 配置变更走 updateConfig，500ms 防抖写回 .projmeta.json
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createMultiInstanceFilter,
  type PluginContext,
  type ProjectMeta,
  type RoutedPayload,
} from "plugin-protocol"
import type { KmgrApi } from "kmgr-api"
import type { ImageEntry, GalleryConfig, SortKey, SortDir, ThumbnailSize } from "./types"
import {
  flattenImages,
  migrateRatings,
  sortImages,
  filterByRating,
  filterBySearch,
  toAssetUrl,
} from "./utils"
import { GalleryGrid } from "./GalleryGrid"
import { Lightbox } from "./Lightbox"

/** 主组件 */
export function GalleryViewer({
  containerId,
  emit,
  on,
  kmgr,
}: PluginContext) {
  const kmgrApi = kmgr as KmgrApi | undefined
  const [projPath, setProjPath] = useState("")
  const [meta, setMeta] = useState<ProjectMeta | null>(null)
  const [images, setImages] = useState<ImageEntry[]>([])
  const [search, setSearch] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [config, setConfig] = useState<GalleryConfig>({})
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [lastAnchor, setLastAnchor] = useState<string | null>(null)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 多实例过滤器只需按 containerId 创建一次，避免每次渲染重订阅
  const filter = useMemo(() => createMultiInstanceFilter(containerId), [containerId])

  /** 防抖写回 .projmeta.json */
  const debouncedWriteConfig = useCallback(
    (path: string, meta: ProjectMeta, nextConfig: GalleryConfig) => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
      writeTimer.current = setTimeout(async () => {
        if (!kmgrApi) return
        try {
          const metaPath = `${path.replace(/[\\/]+$/, "")}/.projmeta.json`
          const updated: ProjectMeta = {
            ...meta,
            updatedAt: new Date().toISOString(),
            [meta.type]: nextConfig,
          }
          await kmgrApi.writeTextFile(metaPath, JSON.stringify(updated, null, 2))
        } catch (e) {
          emit("toast:show", {
            type: "error",
            message: `保存图库配置失败：${e instanceof Error ? e.message : e}`,
          })
        }
      }, 500)
    },
    [kmgrApi, emit],
  )

  /** 更新配置并触发写回 */
  const updateConfig = useCallback(
    (updater: (prev: GalleryConfig) => GalleryConfig) => {
      if (!meta || !projPath) return
      const next = updater({ ...config })
      setConfig(next)
      debouncedWriteConfig(projPath, meta, next)
    },
    [config, meta, projPath, debouncedWriteConfig],
  )

  /** 加载项目图片 */
  const loadProject = useCallback(
    async (payload: { path: string; meta: ProjectMeta }) => {
      if (!kmgrApi) return
      setLoading(true)
      setProjPath(payload.path)
      setMeta(payload.meta)

      // 提取 gallery 配置，并把旧 ratings 字段迁移到 metas
      const rawConfig = (payload.meta[payload.meta.type] as GalleryConfig | undefined) ?? {}
      const migratedMetas = migrateRatings(rawConfig)
      const galleryConfig: GalleryConfig = { ...rawConfig, metas: migratedMetas }
      setConfig(galleryConfig)

      // 切换项目时清空选择 / 灯箱 / 锚点
      setSelection(new Set())
      setSelectionMode(false)
      setLastAnchor(null)
      setLightboxIndex(null)

      try {
        const entries = await kmgrApi.listDirectory(payload.path, true)
        const allImages = flattenImages(entries, payload.path)
        setImages(allImages)
      } catch (e) {
        emit("toast:show", {
          type: "error",
          message: `加载图库失败：${e instanceof Error ? e.message : e}`,
        })
      } finally {
        setLoading(false)
      }
    },
    [kmgrApi, emit],
  )

  // 订阅 project:open 事件
  useEffect(() => {
    const off = on("project:open", (payload) => {
      if (!filter(payload as RoutedPayload)) return
      if (typeof (payload as Record<string, unknown>).path === "string") {
        void loadProject(payload as { path: string; meta: ProjectMeta })
      }
    })
    return off
  }, [on, filter, loadProject])

  // 清理 timer
  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
    }
  }, [])

  // ===== 三级管道：排序 → 星标筛选 → 搜索 =====
  const sortedImages = useMemo(
    () => sortImages(images, config.metas, config.sortBy ?? "name", config.sortDir ?? "asc"),
    [images, config.metas, config.sortBy, config.sortDir],
  )
  const filteredByRating = useMemo(
    () => filterByRating(sortedImages, config.metas, config.minRating ?? 0),
    [sortedImages, config.metas, config.minRating],
  )
  const filteredImages = useMemo(
    () => filterBySearch(filteredByRating, search),
    [filteredByRating, search],
  )

  // ===== 事件处理 =====

  /** 点击 tile 进入灯箱（非多选模式） */
  const handleImageClick = useCallback((idx: number) => {
    setLightboxIndex(idx)
  }, [])

  /**
   * 切换选择：
   *  - shift=true 且 lastAnchor 非空：把 anchor 到当前之间的所有图加入 selection（不清空已有）
   *  - 否则：toggle relPath
   *  - 更新 lastAnchor；selection 非空时自动进入多选模式
   */
  const handleToggleSelect = useCallback(
    (relPath: string, shift: boolean) => {
      setSelection((prev) => {
        const next = new Set(prev)
        if (shift && lastAnchor) {
          const anchorIdx = filteredImages.findIndex((i) => i.relPath === lastAnchor)
          const curIdx = filteredImages.findIndex((i) => i.relPath === relPath)
          if (anchorIdx >= 0 && curIdx >= 0) {
            const [lo, hi] = anchorIdx <= curIdx ? [anchorIdx, curIdx] : [curIdx, anchorIdx]
            for (let i = lo; i <= hi; i++) {
              next.add(filteredImages[i].relPath)
            }
          } else {
            // anchor 失效时退化为 toggle
            if (next.has(relPath)) next.delete(relPath)
            else next.add(relPath)
          }
        } else {
          if (next.has(relPath)) next.delete(relPath)
          else next.add(relPath)
        }
        if (next.size > 0) setSelectionMode(true)
        return next
      })
      setLastAnchor(relPath)
    },
    [filteredImages, lastAnchor],
  )

  /** 单图打星 — 写入 metas[relPath].rating，并通知外部 */
  const handleRate = useCallback(
    (relPath: string, rating: number) => {
      updateConfig((c) => ({
        ...c,
        metas: {
          ...(c.metas ?? {}),
          [relPath]: {
            ...(c.metas?.[relPath] ?? {}),
            rating,
          },
        },
      }))
      emit("gallery:rating-changed", { relPath, rating })
    },
    [updateConfig, emit],
  )

  /** 设为封面 */
  const handleSetCover = useCallback(
    (relPath: string) => {
      updateConfig((c) => ({ ...c, cover: relPath }))
      emit("gallery:cover-changed", { relPath })
    },
    [updateConfig, emit],
  )

  /** 在文件列表定位 — 同时发 folder:locate 与 file-list:command */
  const handleLocate = useCallback(
    (relPath: string) => {
      const path = `${projPath.replace(/[\\/]+$/, "")}/${relPath}`.replace(/\\/g, "/")
      emit("folder:locate", { path })
      emit("file-list:command", { command: "locate-entry", path })
    },
    [projPath, emit],
  )

  /** 实际执行删除（不弹确认）— kmgrApi.deleteFile + 从列表/选择/封面引用中移除 */
  const performDelete = useCallback(
    async (relPath: string) => {
      if (!kmgrApi) return
      const img = images.find((i) => i.relPath === relPath)
      if (!img) return
      try {
        await kmgrApi.deleteFile(img.path)
        setImages((prev) => prev.filter((i) => i.relPath !== relPath))
        // 从 selection 中也清掉
        setSelection((prev) => {
          if (!prev.has(relPath)) return prev
          const next = new Set(prev)
          next.delete(relPath)
          return next
        })
        // 删的若是封面，清掉封面引用，避免工具栏残留失效缩略图
        if (config.cover === relPath) {
          updateConfig((c) => ({ ...c, cover: undefined }))
        }
      } catch (e) {
        emit("toast:show", {
          type: "error",
          message: `删除失败：${e instanceof Error ? e.message : e}`,
        })
      }
    },
    [images, kmgrApi, emit, config.cover, updateConfig],
  )

  /** 删除单张 — 先弹框架确认对话框 */
  const handleDelete = useCallback(
    (relPath: string) => {
      const img = images.find((i) => i.relPath === relPath)
      if (!img) return
      emit("dialog:open", {
        type: "confirm",
        title: "删除图片",
        message: `确定删除「${img.name}」？该文件将从磁盘移除，此操作不可恢复。`,
        confirmLabel: "删除",
        cancelLabel: "取消",
        variant: "danger",
        onResult: (confirmed: boolean) => {
          if (confirmed) void performDelete(relPath)
        },
      })
    },
    [images, emit, performDelete],
  )

  /** 批量打星 */
  const handleBatchRate = useCallback(
    (rating: number) => {
      for (const relPath of selection) {
        handleRate(relPath, rating)
      }
    },
    [selection, handleRate],
  )

  /** 批量删除 — 只弹一次确认，确认后逐个删除并退出多选模式 */
  const handleBatchDelete = useCallback(() => {
    const targets = Array.from(selection)
    if (targets.length === 0) return
    emit("dialog:open", {
      type: "confirm",
      title: "批量删除图片",
      message: `确定删除选中的 ${targets.length} 张图片？这些文件将从磁盘移除，此操作不可恢复。`,
      confirmLabel: `删除 ${targets.length} 张`,
      cancelLabel: "取消",
      variant: "danger",
      onResult: async (confirmed: boolean) => {
        if (!confirmed) return
        for (const rel of targets) {
          await performDelete(rel)
        }
        setSelection(new Set())
        setSelectionMode(false)
        setLastAnchor(null)
      },
    })
  }, [selection, emit, performDelete])

  /** 批量取消选择（退出多选模式） */
  const handleClearSelection = useCallback(() => {
    setSelection(new Set())
    setSelectionMode(false)
    setLastAnchor(null)
  }, [])

  // ===== 工具栏内联样式 =====
  const selectStyle: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "var(--font-size-sm)",
  }
  const btnStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "var(--font-size-sm)",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 工具栏 */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        padding: "8px 16px", borderBottom: "1px solid var(--color-border)",
      }}>
        {/* 搜索 */}
        <input
          type="text"
          placeholder="搜索文件名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 140, maxWidth: 240,
            padding: "4px 12px", borderRadius: 4,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)", color: "var(--color-text)",
          }}
        />

        {/* 排序键 */}
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          排序
          <select
            value={config.sortBy ?? "name"}
            onChange={(e) => updateConfig((c) => ({ ...c, sortBy: e.target.value as SortKey }))}
            style={selectStyle}
          >
            <option value="name">名称</option>
            <option value="modified">修改时间</option>
            <option value="size">大小</option>
            <option value="rating">评分</option>
          </select>
        </label>

        {/* 排序方向 */}
        <button
          onClick={() =>
            updateConfig((c) => ({
              ...c,
              sortDir: (c.sortDir ?? "asc") === "asc" ? "desc" : "asc",
            }))
          }
          title={`当前：${(config.sortDir ?? "asc") === "asc" ? "升序" : "降序"}`}
          style={btnStyle}
        >
          ⇅ {(config.sortDir ?? "asc") === "asc" ? "升" : "降"}
        </button>

        {/* 缩略图档位 */}
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          缩略图
          <select
            value={config.thumbnailSize ?? "md"}
            onChange={(e) =>
              updateConfig((c) => ({ ...c, thumbnailSize: e.target.value as ThumbnailSize }))
            }
            style={selectStyle}
          >
            <option value="sm">小</option>
            <option value="md">中</option>
            <option value="lg">大</option>
            <option value="xl">超大</option>
          </select>
        </label>

        {/* 星标筛选 */}
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          评分≥
          <select
            value={config.minRating ?? 0}
            onChange={(e) =>
              updateConfig((c) => ({ ...c, minRating: Number(e.target.value) }))
            }
            style={selectStyle}
          >
            <option value={0}>全部</option>
            <option value={1}>★1</option>
            <option value={2}>★2</option>
            <option value={3}>★3</option>
            <option value={4}>★4</option>
            <option value={5}>★5</option>
          </select>
        </label>

        {/* 统计 */}
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          {filteredImages.length} / {images.length} 张
        </span>

        {/* 封面缩略图 */}
        {config.cover && (
          <img
            src={toAssetUrl(
              `${projPath.replace(/[\\/]+$/, "")}/${config.cover}`.replace(/\\/g, "/"),
            )}
            alt="封面"
            title={`封面：${config.cover}`}
            style={{
              width: 32, height: 32, objectFit: "cover", borderRadius: 4,
              border: "1px solid var(--color-border)",
            }}
          />
        )}

        {/* 多选切换 */}
        <button
          onClick={() => {
            setSelectionMode((v) => !v)
            if (selectionMode) setSelection(new Set())
          }}
          style={{
            ...btnStyle,
            background: selectionMode ? "var(--color-primary)" : btnStyle.background,
            color: selectionMode ? "#fff" : btnStyle.color,
            borderColor: selectionMode ? "var(--color-primary)" : btnStyle.borderColor,
          }}
          title="切换多选模式"
        >
          多选
        </button>
      </div>

      {/* 批量操作条 */}
      {selection.size > 0 && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
          padding: "6px 16px",
          background: "var(--color-bg-secondary)",
          borderBottom: "1px solid var(--color-border)",
          fontSize: "var(--font-size-sm)",
        }}>
          <span style={{ color: "var(--color-text-secondary)" }}>
            已选 {selection.size} 张
          </span>
          <span style={{ color: "var(--color-text-secondary)" }}>批量打星：</span>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleBatchRate(star)}
              style={{ ...btnStyle, padding: "2px 6px" }}
              title={`批量评 ${star} 星`}
            >
              ★{star}
            </button>
          ))}
          <button
            onClick={() => handleBatchRate(0)}
            style={{ ...btnStyle, padding: "2px 6px" }}
            title="批量清零评分"
          >
            清零
          </button>
          <button
            onClick={handleBatchDelete}
            style={{
              ...btnStyle,
              padding: "2px 8px",
              borderColor: "var(--color-danger, #dc2626)",
              color: "var(--color-danger, #dc2626)",
            }}
            title="批量删除"
          >
            批量删除
          </button>
          <button onClick={handleClearSelection} style={{ ...btnStyle, padding: "2px 8px" }}>
            取消选择并退出多选
          </button>
        </div>
      )}

      {/* 网格 / 加载中 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--color-text-secondary)",
          }}>
            正在扫描图片…
          </div>
        ) : filteredImages.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--color-text-secondary)",
          }}>
            {search.trim() ? "未找到匹配的图片" : "图库中暂无图片"}
          </div>
        ) : (
          <GalleryGrid
            images={filteredImages}
            config={config}
            selection={selection}
            selectionMode={selectionMode}
            onImageClick={handleImageClick}
            onToggleSelect={handleToggleSelect}
            onRate={handleRate}
            onSetCover={handleSetCover}
            onLocate={handleLocate}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* 灯箱 */}
      {lightboxIndex !== null && (
        <Lightbox
          images={filteredImages}
          index={lightboxIndex}
          config={config}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onRate={handleRate}
          onSetCover={handleSetCover}
        />
      )}
    </div>
  )
}
