/** 图库主组件 — 接收 project:open 事件，管理图片加载 / 搜索 / 灯箱 / 配置读写 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createMultiInstanceFilter, type PluginContext, type ProjectMeta } from "plugin-protocol"
import type { KmgrApi } from "kmgr-api"
import type { ImageEntry, GalleryConfig } from "./types"
import { flattenImages } from "./utils"
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
  const [projPath, setProjPath] = useState<string>("")
  const [meta, setMeta] = useState<ProjectMeta | null>(null)
  const [images, setImages] = useState<ImageEntry[]>([])
  const [search, setSearch] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [config, setConfig] = useState<GalleryConfig>({})
  const [loading, setLoading] = useState(false)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filter = createMultiInstanceFilter(containerId)

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

      // 提取 gallery 配置
      const galleryConfig = (payload.meta[payload.meta.type] as GalleryConfig | undefined) ?? {}
      setConfig(galleryConfig)

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
      if (!filter(payload as { __targetContainer?: string; openIn?: string })) return
      if (typeof (payload as Record<string, unknown>).path === "string") {
        void loadProject(payload as { path: string; meta: ProjectMeta })
      }
    })
    return off
  }, [on, filter, loadProject])

  // 搜索过滤
  const filteredImages = search.trim()
    ? images.filter((img) =>
        img.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : images

  // 清理 timer
  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
    }
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 工具栏 */}
      <div style={{
        display: "flex", gap: 12, alignItems: "center",
        padding: "8px 16px", borderBottom: "1px solid var(--color-border)",
      }}>
        {/* 搜索 */}
        <input
          type="text"
          placeholder="搜索文件名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, maxWidth: 300,
            padding: "4px 12px", borderRadius: 4,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)", color: "var(--color-text)",
          }}
        />

        {/* 统计 */}
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          {filteredImages.length} / {images.length} 张
        </span>

        {/* 封面缩略图 */}
        {config.cover && (
          <img
            src={
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).__TAURI__?.core?.convertFileSrc?.(
                `${projPath.replace(/[\\/]+$/, "")}/${config.cover}`.replace(/\\/g, "/"),
              )
            }
            alt="封面"
            style={{
              width: 32, height: 32, objectFit: "cover", borderRadius: 4,
              border: "1px solid var(--color-border)",
            }}
          />
        )}
      </div>

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
            onImageClick={(idx) => setLightboxIndex(idx)}
            onSetCover={(relPath) => updateConfig((c) => ({ ...c, cover: relPath }))}
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
          onRate={(relPath, rating) =>
            updateConfig((c) => ({
              ...c,
              ratings: { ...c.ratings, [relPath]: rating },
            }))
          }
          onSetCover={(relPath) => updateConfig((c) => ({ ...c, cover: relPath }))}
        />
      )}
    </div>
  )
}
