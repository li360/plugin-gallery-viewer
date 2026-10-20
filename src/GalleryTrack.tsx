/**
 * 轨迹视图 — 按拍摄时间在地图上连线
 *
 * 交互设计：
 * - 有 EXIF GPS 的图片按拍摄时间（EXIF dateTime，回退文件修改时间）升序排列
 * - 相邻点按时间顺序连成轨迹线（MapView track prop，GeoJSON LineString）
 * - 单点缩略图点击打开灯箱；聚合圆下钻与地点相册一致
 * - 底图跟随全局在线/离线配置（与主程序地图视图共用 localStorage 键）
 */
import { useCallback, useEffect, useMemo, useRef } from "react"
import type { PluginContext } from "plugin-protocol"
import type { KmgrApi, FileGeoPoint } from "kmgr-api"
import { MapView } from "map-core"
import type { ImageMapMarker, MapViewHandle } from "map-core"
import type { ImageEntry, ImageMeta } from "./types"
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
  /** 图库图片列表（已经过排序 / 星标 / 日期 / EXIF / 区域 / 搜索过滤） */
  images: ImageEntry[]
  /** 元数据表 — 读取 EXIF 拍摄时间（dateTime） */
  metas: Record<string, ImageMeta> | undefined
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

/** 取图片拍摄时间戳 — 优先 EXIF dateTime，回退文件修改时间，无法解析为 0（排最前） */
function shootTime(img: ImageEntry, metas: Record<string, ImageMeta> | undefined): number {
  const raw = metas?.[img.relPath]?.exif?.dateTime ?? img.modifiedAt
  if (!raw) return 0
  const ms = Date.parse(raw.replace(" ", "T"))
  return Number.isFinite(ms) ? ms : 0
}

/**
 * 轨迹视图组件 — 按拍摄时间连线
 *
 * 坐标数据由父组件 useGeoIndex 提供（与迷你地图 / 地点相册共享），
 * 本组件负责时间排序、轨迹线生成与大地图渲染。
 */
export function GalleryTrack({ kmgr, images, metas, geoPoints, backfill, onCancelBackfill, emit, onOpenImage }: Props) {
  /** 底图状态（归档选择 + 在线开关，与地点相册共享实现） */
  const { archives, archivesLoading, archive, onlineBasemap, toggleOnline, handleArchiveChange } =
    useMapBasemap()
  /** MapView 命令式句柄 — 初始 fitTo 用 */
  const mapRef = useRef<MapViewHandle>(null)
  /** 初始全量 fitTo 是否已执行 */
  const didInitialFitRef = useRef(false)

  /** 有坐标的图片按拍摄时间升序 — 轨迹的点序列 */
  const trackItems = useMemo(() => {
    const withGeo = images.filter((img) => geoPoints.has(normPath(img.path)))
    return withGeo.slice().sort((a, b) => shootTime(a, metas) - shootTime(b, metas))
  }, [images, geoPoints, metas])

  /**
   * 地图标记 — 与轨迹同序（时间升序）。
   * 缩略图直接用 asset 协议 URL（与网格一致，浏览器自带缓存）。
   */
  const markers: ImageMapMarker[] = useMemo(
    () =>
      trackItems.map((img) => {
        const p = geoPoints.get(normPath(img.path))!
        return {
          path: img.path,
          name: img.name,
          ext: img.ext,
          lat: p.latitude,
          lng: p.longitude,
          thumbnailUrl: toAssetUrl(img.path),
        }
      }),
    [trackItems, geoPoints],
  )

  /** 轨迹坐标序列（WGS-84，按拍摄时间排序） */
  const track = useMemo(
    () => ({
      coordinates: trackItems.map((img) => {
        const p = geoPoints.get(normPath(img.path))!
        return [p.longitude, p.latitude] as [number, number]
      }),
    }),
    [trackItems, geoPoints],
  )

  // 首次拿到轨迹后自动 fitTo 全部点位，保证初始视野能看到完整轨迹
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
        title="轨迹视图"
        stats={
          kmgr
            ? `${markers.length} / ${images.length} 张有位置 · 按拍摄时间连线`
            : "纯前端模式：位置数据不可用"
        }
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
            track={track}
            onMarkerClick={handleMarkerClick}
            onlineBasemap={onlineBasemap}
          />
        )}
      </div>
    </div>
  )
}
