/**
 * 地点相册视图 — 「地图即索引」的图库浏览模式
 *
 * 交互设计：
 * - 聚合圆 = 地点分组（显示张数），点击逐级放大下钻（MapView 内置 supercluster）
 * - 最底层单点 = 圆形照片缩略图，点击打开灯箱看大图
 * - 底图跟随全局在线/离线配置（与主程序地图视图共用 localStorage 键）
 * - 进入视图时自动为无坐标图片批量补解析 EXIF GPS（显示进度、可取消）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PluginContext } from "plugin-protocol"
import type { KmgrApi, FileGeoPoint } from "kmgr-api"
import { MapView, useMapArchives, ONLINE_BASEMAP_STORAGE_KEY } from "map-core"
import type { ImageMapMarker, MapViewHandle } from "map-core"
import type { ImageEntry } from "./types"
import { toAssetUrl } from "./utils"
import { fetchGalleryGeoIndex, backfillGeo } from "./geoService"

/** localStorage 键 — 与主程序地图视图共用，记住用户选择的离线归档 */
const ARCHIVE_STORAGE_KEY = "gewu-map-selected-archive"

/** 规范化路径 — 与 geoService 一致的反斜杠统一 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/")
}

interface Props {
  /** 知识库 API（undefined = 纯前端模式） */
  kmgr: KmgrApi | undefined
  /** 图库图片列表（已经过排序 / 星标 / 搜索过滤） */
  images: ImageEntry[]
  /** 事件发射器（toast / 打开设置面板） */
  emit: PluginContext["emit"]
  /** 点击单点缩略图 — 打开灯箱（传 relPath） */
  onOpenImage: (relPath: string) => void
}

/**
 * 地点相册视图组件
 *
 * 数据流：
 * images 变化 → fetchGalleryGeoIndex 拉坐标 → 有缺 → backfillGeo 后台补解析 → 合并更新
 */
export function GalleryMap({ kmgr, images, emit, onOpenImage }: Props) {
  /** 已安装的 PMTiles 归档（map-core Hook） */
  const { archives, loading: archivesLoading } = useMapArchives()
  /** 用户选择的归档 ID（null 时回退到第一个已安装归档） */
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(ARCHIVE_STORAGE_KEY) : null,
  )
  /** 在线底图开关 — 与地图视图 / 选点器共用同一 localStorage 键 */
  const [onlineBasemap, setOnlineBasemap] = useState<boolean>(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(ONLINE_BASEMAP_STORAGE_KEY) === "1",
  )
  /** 图库图片坐标索引（key = 规范化路径） */
  const [geoPoints, setGeoPoints] = useState<Map<string, FileGeoPoint>>(new Map())
  /** 补解析进度（null = 未在进行） */
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null)
  /** 补解析取消标志 — 卸载 / images 变化时置 true 中断后台循环 */
  const cancelRef = useRef(false)
  /** MapView 命令式句柄 — 初始 fitTo 用 */
  const mapRef = useRef<MapViewHandle>(null)
  /** 初始全量 fitTo 是否已执行 */
  const didInitialFitRef = useRef(false)

  /** 当前生效归档：优先用户选择，缺省取第一个 */
  const archive = useMemo(
    () => archives.find((a) => a.id === selectedId) ?? archives[0] ?? null,
    [archives, selectedId],
  )

  // images 变化（进入视图 / 换项目 / 删除图片）→ 重拉坐标 + 后台补解析
  useEffect(() => {
    if (!kmgr) return
    let cancelled = false
    cancelRef.current = false
    ;(async () => {
      try {
        const { points, missing } = await fetchGalleryGeoIndex(kmgr, images)
        if (cancelled) return
        setGeoPoints(new Map(points))
        if (missing.length > 0) {
          const added = await backfillGeo(
            kmgr,
            missing,
            (done, total) => {
              if (!cancelled) setBackfill({ done, total })
            },
            () => cancelled,
          )
          if (cancelled) return
          // 合并本次新解析点位，地图即时出点（无需重新查库）
          if (added.length > 0) {
            setGeoPoints((prev) => {
              const next = new Map(prev)
              for (const p of added) next.set(normPath(p.path), p)
              return next
            })
          }
        }
        setBackfill(null)
      } catch {
        // 点位查询失败不致命 — 保留已加载部分
        if (!cancelled) setBackfill(null)
      }
    })()
    return () => {
      cancelled = true
      cancelRef.current = true
    }
  }, [kmgr, images])

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

  /** 切换在线/离线底图并持久化 — 与主程序地图视图状态保持一致 */
  const toggleOnline = () => {
    setOnlineBasemap((v) => {
      const next = !v
      localStorage.setItem(ONLINE_BASEMAP_STORAGE_KEY, next ? "1" : "0")
      return next
    })
  }

  /** 切换离线归档并持久化选择 */
  const handleArchiveChange = (id: string) => {
    setSelectedId(id)
    localStorage.setItem(ARCHIVE_STORAGE_KEY, id)
  }

  const btnStyle: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    padding: "2px 8px",
    background: "var(--color-bg)",
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border)",
    borderRadius: 4,
    cursor: "pointer",
  }

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
      {/* 工具栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-xs, 6px)",
          padding: "6px 16px",
          borderBottom: "1px solid var(--color-border)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
          地点相册
        </span>

        {/* 点位统计 */}
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
          {kmgr ? `${markers.length} / ${images.length} 张有位置` : "纯前端模式：位置数据不可用"}
        </span>

        {/* 补解析进度 + 取消 */}
        {backfill && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
              定位解析中 ({backfill.done}/{backfill.total})…
            </span>
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true
              }}
              style={btnStyle}
              title="停止后台位置解析（已解析的结果保留）"
            >
              停止
            </button>
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* 归档选择 — 多归档时显示下拉 */}
        {archives.length > 1 && (
          <select
            value={archive?.id ?? ""}
            onChange={(e) => handleArchiveChange(e.target.value)}
            style={{
              fontSize: "var(--font-size-xs)",
              padding: "2px 4px",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
            }}
          >
            {archives.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        {/* 在线底图切换 — 与主程序共用全局配置 */}
        <button
          type="button"
          onClick={toggleOnline}
          title={
            onlineBasemap
              ? "已启用在线底图（高德地图），点击切回离线"
              : "启用在线底图（高德地图，细节更丰富）"
          }
          style={{
            ...btnStyle,
            background: onlineBasemap ? "var(--color-primary)" : btnStyle.background,
            color: onlineBasemap ? "var(--color-text-on-primary, #fff)" : btnStyle.color,
            borderColor: onlineBasemap ? "var(--color-primary)" : btnStyle.borderColor,
          }}
        >
          在线
        </button>

        {/* 无归档且非在线 — 引导下载地图 */}
        {!archivesLoading && archives.length === 0 && !onlineBasemap && (
          <button
            type="button"
            onClick={() => emit("overlay:open", { pluginId: "settings" })}
            style={{
              ...btnStyle,
              background: "var(--color-primary)",
              color: "var(--color-text-on-primary, #fff)",
              borderColor: "var(--color-primary)",
            }}
          >
            下载地图
          </button>
        )}
      </div>

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
