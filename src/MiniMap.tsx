/**
 * 迷你地图 — 网格/时间线视图右上角的位置分布概览 + 区域筛选器
 *
 * 交互：
 * - 显示当前筛选后图片中有 GPS 的点位（聚合圆）
 * - 用户缩放/平移到目标区域，点「应用视野」即按当前地图经纬度范围筛选图片
 * - 点「清除」取消区域筛选，恢复显示全部
 *
 * 设计原则：
 * - 与地点相册大地图共享同一份 geoPoints（由 GalleryViewer 的 useGeoIndex 提供）
 * - 小尺寸下不显示缩略图，只用聚合圆
 * - 地图状态不持久化（每次进入视图重置视野）
 */
import { useEffect, useMemo, useRef, useState } from "react"
import type { FileGeoPoint } from "kmgr-api"
import { MapView, useMapArchives, ONLINE_BASEMAP_STORAGE_KEY } from "map-core"
import type { ImageMapMarker, MapViewHandle } from "map-core"
import type { ImageEntry } from "./types"

/** localStorage 键 — 与主程序地图视图共用，记住用户选择的离线归档 */
const ARCHIVE_STORAGE_KEY = "gewu-map-selected-archive"

/** 规范化路径 — 与 geoService 一致的反斜杠统一 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/")
}

interface Props {
  /** 图库图片列表（已筛选后的可见图片） */
  images: ImageEntry[]
  /** 图库坐标索引（与地点相册共享） */
  geoPoints: Map<string, FileGeoPoint>
  /** 区域筛选回调 — bbox = [minLng, minLat, maxLng, maxLat]，null 表示清除 */
  onRegionChange: (bbox: [number, number, number, number] | null) => void
}

/**
 * 迷你地图组件
 */
export function MiniMap({ images, geoPoints, onRegionChange }: Props) {
  /** 已安装的 PMTiles 归档 */
  const { archives } = useMapArchives()
  const [selectedId] = useState<string | null>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(ARCHIVE_STORAGE_KEY) : null),
  )
  const [onlineBasemap] = useState<boolean>(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(ONLINE_BASEMAP_STORAGE_KEY) === "1",
  )
  /** MapView 命令式句柄 — 获取当前视野 bbox */
  const mapRef = useRef<MapViewHandle>(null)
  /** 迷你地图展开/收起状态 */
  const [open, setOpen] = useState(true)

  /** 当前生效归档：优先用户选择，缺省取第一个 */
  const archive = useMemo(
    () => archives.find((a) => a.id === selectedId) ?? archives[0] ?? null,
    [archives, selectedId],
  )

  /** 迷你地图标记 — 只传有坐标的图片，不传缩略图（小尺寸无需） */
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
        // 小地图不显示缩略图，避免大量图片加载
        thumbnailUrl: undefined,
      })
    }
    return out
  }, [images, geoPoints])

  // 标记变化时自动适配视野（首次加载和筛选变化时）
  useEffect(() => {
    if (markers.length === 0) return
    const timer = setTimeout(() => {
      mapRef.current?.fitTo(
        markers.map((m) => ({ lat: m.lat, lng: m.lng })),
        { maxZoom: 10 },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [markers])

  /** 应用当前视野作为区域筛选 */
  const applyView = () => {
    const bbox = mapRef.current?.getBounds()
    if (bbox) onRegionChange(bbox)
  }

  /** 清除区域筛选 */
  const clearRegion = () => onRegionChange(null)

  const hasGeo = markers.length > 0

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="展开迷你地图"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          fontSize: "var(--font-size-xs)",
          padding: "2px 8px",
          background: "var(--color-bg)",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          cursor: "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        🗺️ 地图
      </button>
    )
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
        width: 220,
        height: 150,
        borderRadius: 6,
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        background: "var(--color-bg)",
      }}
    >
      {/* 顶栏：标题 + 收起 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "2px 6px",
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        <span style={{ color: "var(--color-text-secondary)" }}>
          区域筛选 {hasGeo ? `(${markers.length}点)` : ""}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="收起"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-sm)",
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* 地图区域 */}
      <div style={{ width: "100%", height: "calc(100% - 44px)" }}>
        {hasGeo ? (
          <MapView
            ref={mapRef}
            archive={archive}
            markers={markers}
            onlineBasemap={onlineBasemap}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-disabled)",
            }}
          >
            暂无带位置的图片
          </div>
        )}
      </div>

      {/* 底栏：应用 / 清除 */}
      {hasGeo && (
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "2px 6px",
            background: "var(--color-bg-elevated)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <button
            type="button"
            onClick={applyView}
            title="按当前地图视野筛选图片"
            style={{
              flex: 1,
              fontSize: "var(--font-size-xs)",
              padding: "1px 4px",
              background: "var(--color-primary)",
              color: "var(--color-text-on-primary, #fff)",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            应用视野
          </button>
          <button
            type="button"
            onClick={clearRegion}
            title="取消区域筛选"
            style={{
              flex: 1,
              fontSize: "var(--font-size-xs)",
              padding: "1px 4px",
              background: "var(--color-bg)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            清除
          </button>
        </div>
      )}
    </div>
  )
}
