/**
 * 图库网格视图 — 按子目录分组、tile 含文件名与打星、悬浮操作条、多选
 *
 * 设计要点：
 *  - 非多选模式下点击 tile 进入灯箱；多选模式下点击切换选中
 *  - Ctrl/Cmd+点击：强制切换选中（不论模式）
 *  - Shift+点击：从上次 anchor 到当前做范围选择
 *  - tile 右上角星标角：点击循环 0→1→2→3→4→5→0
 *  - tile 悬浮时浮出操作条：打开 / 设为封面 / 在文件列表定位 / 删除
 */

import { useMemo, useState } from "react"
import type { ImageEntry, GalleryConfig } from "./types"
import {
  groupByFolder,
  toAssetUrl,
  THUMBNAIL_MIN_SIZE,
  THUMBNAIL_TILE_SIZE,
  truncateName,
  formatFileSize,
} from "./utils"

interface Props {
  images: ImageEntry[]
  config: GalleryConfig
  /** 当前选中的 relPath 集合 */
  selection: Set<string>
  /** 是否处于多选模式（影响 click 行为） */
  selectionMode: boolean
  /** 进入灯箱（仅非多选模式触发） */
  onImageClick: (index: number) => void
  /** 切换选择；shift=true 时做范围选 */
  onToggleSelect: (relPath: string, shift: boolean) => void
  /** 打星 */
  onRate: (relPath: string, rating: number) => void
  /** 设为封面 */
  onSetCover: (relPath: string) => void
  /** 在文件列表定位（emit folder:locate） */
  onLocate: (relPath: string) => void
  /** 删除单张 */
  onDelete: (relPath: string) => void
}

/** 图库网格组件 */
export function GalleryGrid({
  images,
  config,
  selection,
  selectionMode,
  onImageClick,
  onToggleSelect,
  onRate,
  onSetCover,
  onLocate,
  onDelete,
}: Props) {
  const groups = groupByFolder(images)
  // 预建 路径→全局索引 映射，避免组内每项 findIndex 造成 O(n²)
  const indexByPath = useMemo(() => {
    const m = new Map<string, number>()
    images.forEach((img, i) => m.set(img.relPath, i))
    return m
  }, [images])

  const thumbnailSize = config.thumbnailSize ?? "md"
  const minColumn = THUMBNAIL_MIN_SIZE[thumbnailSize]
  const tileH = THUMBNAIL_TILE_SIZE[thumbnailSize]
  const metas = config.metas ?? {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      {Array.from(groups.entries()).map(([groupName, groupImages]) => (
        <section key={groupName}>
          <h3 style={{
            margin: "0 0 8px 0",
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-secondary)",
            fontWeight: 600,
          }}>
            {groupName}
            <span style={{ marginLeft: 8, fontWeight: 400 }}>
              ({groupImages.length})
            </span>
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${minColumn}px, 1fr))`,
            gap: 8,
          }}>
            {groupImages.map((img) => {
              const globalIndex = indexByPath.get(img.relPath) ?? 0
              return (
                <GalleryTile
                  key={img.relPath}
                  img={img}
                  globalIndex={globalIndex}
                  rating={metas[img.relPath]?.rating ?? 0}
                  isCover={config.cover === img.relPath}
                  isSelected={selection.has(img.relPath)}
                  selectionMode={selectionMode}
                  tileH={tileH}
                  onImageClick={onImageClick}
                  onToggleSelect={onToggleSelect}
                  onRate={onRate}
                  onSetCover={onSetCover}
                  onLocate={onLocate}
                  onDelete={onDelete}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 单个 tile 的 props */
interface TileProps {
  img: ImageEntry
  globalIndex: number
  rating: number
  isCover: boolean
  isSelected: boolean
  selectionMode: boolean
  tileH: number
  onImageClick: (index: number) => void
  onToggleSelect: (relPath: string, shift: boolean) => void
  onRate: (relPath: string, rating: number) => void
  onSetCover: (relPath: string) => void
  onLocate: (relPath: string) => void
  onDelete: (relPath: string) => void
}

/** 单个图库 tile */
function GalleryTile({
  img,
  globalIndex,
  rating,
  isCover,
  isSelected,
  selectionMode,
  tileH,
  onImageClick,
  onToggleSelect,
  onRate,
  onSetCover,
  onLocate,
  onDelete,
}: TileProps) {
  // 点击处理：多选模式 / Ctrl / Shift 都走选择；否则进灯箱
  const handleClick = (e: React.MouseEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (selectionMode || mod) {
      onToggleSelect(img.relPath, e.shiftKey)
      return
    }
    if (e.shiftKey) {
      onToggleSelect(img.relPath, true)
      return
    }
    onImageClick(globalIndex)
  }

  // 右键：进入多选模式并选中当前 + 触发父级菜单（简化版：直接 toggle + 进入多选）
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!isSelected) onToggleSelect(img.relPath, false)
  }

  // 悬浮态：用于显示/隐藏操作条（内联 style 无法用 :hover）
  const [hovered, setHovered] = useState(false)
  // 打分悬停预览：鼠标移到第 N 颗时高亮前 N 颗（0 = 不预览，显示实际评分）
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={img.name}
      style={{
        position: "relative",
        borderRadius: 4,
        overflow: "hidden",
        cursor: "pointer",
        border: isSelected
          ? "2px solid var(--color-primary)"
          : isCover
            ? "2px solid var(--color-primary)"
            : "1px solid var(--color-border)",
        boxShadow: isSelected ? "0 0 0 2px var(--color-primary)" : undefined,
        background: "var(--color-bg-secondary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 缩略图 */}
      <div style={{ position: "relative", width: "100%", height: tileH, overflow: "hidden" }}>
        <img
          src={toAssetUrl(img.path)}
          alt={img.name}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {/* 选中角标 */}
        {isSelected && (
          <div style={{
            position: "absolute", top: 4, left: 4,
            width: 18, height: 18, borderRadius: 9,
            background: "var(--color-primary)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>✓</div>
        )}

        {/* 打星 — 五颗星常驻显示，悬停预览，点当前评分星可清零 */}
        <div
          style={{
            position: "absolute", top: 4, right: 4,
            display: "flex",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 9, padding: "1px 4px",
          }}
          onMouseLeave={() => setHoverRating(0)}
          onClick={(e) => e.stopPropagation()}
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= (hoverRating || rating)
            return (
              <button
                key={star}
                onMouseEnter={() => setHoverRating(star)}
                onClick={(e) => {
                  e.stopPropagation()
                  onRate(img.relPath, star === rating ? 0 : star)
                }}
                title={`评 ${star} 星${star === rating ? "（再次点击清零）" : ""}`}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "0 1px", fontSize: 12, lineHeight: "16px",
                  color: active ? "#fbbf24" : "rgba(255,255,255,0.45)",
                }}
              >
                ★
              </button>
            )
          })}
        </div>

        {/* 封面标记 */}
        {isCover && (
          <div style={{
            position: "absolute", bottom: 4, left: 4,
            background: "var(--color-primary)", color: "#fff",
            padding: "2px 6px", borderRadius: 3,
            fontSize: 11, fontWeight: 500,
          }}>
            封面
          </div>
        )}

        {/* 悬浮操作条 */}
        <div
          className="gallery-tile-actions"
          style={{
            position: "absolute", bottom: 4, right: 4,
            display: "flex", gap: 4,
            opacity: hovered ? 1 : 0, transition: "opacity 0.15s",
          }}
        >
          <TileAction label="打开" onClick={(e) => { e.stopPropagation(); onImageClick(globalIndex) }} />
          <TileAction label="封面" onClick={(e) => { e.stopPropagation(); onSetCover(img.relPath) }} disabled={isCover} />
          <TileAction label="定位" onClick={(e) => { e.stopPropagation(); onLocate(img.relPath) }} />
          <TileAction label="删除" onClick={(e) => { e.stopPropagation(); onDelete(img.relPath) }} danger />
        </div>
      </div>

      {/* 文件名 + 大小 */}
      <div style={{
        padding: "4px 6px",
        fontSize: "var(--font-size-xs)",
        color: "var(--color-text-secondary)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }} title={`${img.name} · ${formatFileSize(img.size)}`}>
        {truncateName(img.name, 22)}
      </div>
    </div>
  )
}

/** tile 悬浮操作条的小按钮 */
function TileAction({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "2px 6px",
        background: disabled ? "var(--color-primary)" : "rgba(0,0,0,0.65)",
        color: "#fff",
        border: "none", borderRadius: 3,
        fontSize: 11, cursor: disabled ? "default" : "pointer",
      }}
    >
      {danger ? "×" : label}
    </button>
  )
}
