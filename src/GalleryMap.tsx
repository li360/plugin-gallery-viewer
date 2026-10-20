/**
 * 地点相册视图 — 「地图即索引」的图库浏览模式
 *
 * 交互设计：
 * - 聚合圆 = 地点分组（显示张数），点击逐级放大下钻（MapView 内置 supercluster）
 * - 最底层单点 = 圆形照片缩略图，点击打开灯箱看大图
 * - 底图跟随全局在线/离线配置（与主程序地图视图共用 localStorage 键）
 * - 进入视图时自动为无坐标图片批量补解析 EXIF GPS（显示进度、可取消）
 */
import { useCallback, useEffect, useMemo, useRef } from "react"
import type { PluginContext } from "plugin-protocol"
import type { KmgrApi, FileGeoPoint } from "kmgr-api"
import { MapView } from "map-core"
import type { ImageMapMarker, MapViewHandle } from "map-core"
import type { ImageEntry } from "./types"
import { toAssetUrl } from "./utils"
import { useMapBasemap } from "./useMapBasemap"
import { MapToolbar } from "./MapToolbar"

/** 规范化路径 — 与 geoService 一致的反斜杠统一 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/")
}

interface Props {
  /** 知识库 API（undefined = 纯前端模式） */
  kmgr: KmgrApi | undefined
  /** 图库图片列表（已经过排序 / 星标 / 搜索过滤） */
  images: ImageEntry[]
  /** 图库坐标索引（由 GalleryViewer 的 useGeoIndex 提供，与迷你地图共享） */
  geoPoints: Map<string, FileGeoPoint>
  /** 补解析进度（null = 未在进行） */
  backfill: { done: number; total: number } | null
  /** 取消补解析回调（停止按钮） */
  onCancelBackfill?: () => void
  /** 事件发射器（toast / 打开设置面板） */
  emit: PluginContext["emit"]
  /** 点击单点缩略图 — 打开灯箱（传 relPath） */
  onOpenImage: (relPath: string) => void
}

/**
 * 地点相册视图组件 — 「地图即索引」
 *
 * 坐标数据由父组件 useGeoIndex 提供（与迷你地图共享），
 * 本组件只负责大地图渲染：聚合圆下钻、单点缩略图点击开灯箱。
 */
export function GalleryMap({ kmgr, images, geoPoints, backfill, onCancelBackfill, emit, onOpenImage }: Props) {
  /** 底图状态（归档选择 + 在线开关，与轨迹视图共享实现） */
  const { archives, archivesLoading, archive, onlineBasemap, toggleOnline, handleArchiveChange } =
    useMapBasemap()
  /** MapView 命令式句柄 — 初始 fitTo 用 */
  const mapRef = useRef<MapViewHandle>(null)
  /** 初始全量 fitTo 是否已执行 */
  const didInitialFitRef = useRef(false)

  /**
   * 地图标记 — 图库内有坐标的图片。
   * 缩略图直接用 asset 协议 URL（与网格一致，浏览器自带缓存）。
   */
  const markers: ImageMapMarker[] = useMemo(() => {
    const out: ImageMapMarker[] = []
    for (const img of images) {
      const p = geoPoints.get(normPath(img.path))
      if (!p) continue
      out.push({
        path: img.path,
        name: img.name,
        ext: img.ext,
        lat: p.latitude,
        lng: p.longitude,
        thumbnailUrl: toAssetUrl(img.path),
      })
    }
    return out
  }, [images, geoPoints])

  // 首次拿到标记后自动 fitTo 全部点位，保证初始视野能看到内容
  useEffect(() => {
    if (didInitialFitRef.current || markers.length === 0) return
    didInitialFitRef.current = true
    const timer = setTimeout(() => {
      mapRef.current?.fitTo(
        markers.map((m) => ({ lat: m.lat, lng: m.lng })),
        { maxZoom: 12 },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [markers])

  /** 点击单点 — 反查 relPath 并打开灯箱 */
  const handleMarkerClick = useCallback(
    (marker: ImageMapMarker) => {
      const img = images.find((i) => i.path === marker.path)
      if (img) onOpenImage(img.relPath)
    },
    [images, onOpenImage],
  )

  /** 是否处于「有图但还没有任何坐标」状态 — 用于空态提示 */
  const noGeoAtAll = images.length > 0 && markers.length === 0 && !backfill

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <MapToolbar
        title="地点相册"
        stats={kmgr ? `${markers.length} / ${images.length} 张有位置` : "纯前端模式：位置数据不可用"}
        backfill={backfill}
        onCancelBackfill={onCancelBackfill}
        archives={archives}
        archivesLoading={archivesLoading}
        archive={archive}
        onArchiveChange={handleArchiveChange}
        onlineBasemap={onlineBasemap}
        onToggleOnline={toggleOnline}
        onOpenSettings={() => emit("overlay:open", { pluginId: "settings" })}
      />

      {/* 地图主体 / 空态 */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {images.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            图库中暂无图片
          </div>
        ) : noGeoAtAll ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-secondary)",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 32 }}>🗺️</span>
            <span style={{ fontSize: "var(--font-size-sm)" }}>没有找到带位置信息的图片</span>
            <span style={{ fontSize: "var(--font-size-xs)" }}>
              图片需包含 EXIF GPS 数据；新加入的图片可稍后重试
            </span>
          </div>
        ) : (
          <MapView
            ref={mapRef}
            archive={archive}
            markers={markers}
            onMarkerClick={handleMarkerClick}
            onlineBasemap={onlineBasemap}
          />
        )}
      </div>
    </div>
  )
}
