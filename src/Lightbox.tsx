/** 灯箱组件 — 大图预览 + 缩放 + 左右切换 + EXIF + 打星 */

import { useEffect, useState } from "react"
import type { ImageEntry, GalleryConfig } from "./types"
import { toAssetUrl } from "./utils"
import { readExif, type ExifInfo } from "./exif"

interface Props {
  images: ImageEntry[]
  index: number
  config: GalleryConfig
  onClose: () => void
  onNavigate: (index: number) => void
  onRate: (relPath: string, rating: number) => void
  onSetCover: (relPath: string) => void
}

/** 灯箱组件 */
export function Lightbox({ images, index, config, onClose, onNavigate, onRate, onSetCover }: Props) {
  const [zoom, setZoom] = useState(1)
  const [exif, setExif] = useState<ExifInfo | null>(null)
  const [showExif, setShowExif] = useState(false)
  const img = images[index]
  const rating = config.ratings?.[img.relPath] ?? 0
  const isCover = config.cover === img.relPath

  // 读取 EXIF
  useEffect(() => {
    setExif(null)
    readExif(img.path).then(setExif)
  }, [img.path])

  // 键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1)
      if (e.key === "ArrowRight" && index < images.length - 1) onNavigate(index + 1)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [index, images.length, onClose, onNavigate])

  // 缩放控制
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)))
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      {/* 图片 */}
      <div
        style={{ maxWidth: "90vw", maxHeight: "85vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <img
          src={toAssetUrl(img.path)}
          alt={img.name}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
            transition: "transform 0.1s",
            display: "block",
            maxWidth: "100%",
            maxHeight: "85vh",
          }}
        />
      </div>

      {/* 控制栏 */}
      <div
        style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 16, alignItems: "center",
          background: "rgba(0,0,0,0.6)", padding: "8px 16px", borderRadius: 8,
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 打星 */}
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onRate(img.relPath, star === rating ? 0 : star)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 20, color: star <= rating ? "#fbbf24" : "#666",
              }}
            >
              ★
            </button>
          ))}
        </div>

        {/* 设为封面 */}
        <button
          onClick={() => onSetCover(img.relPath)}
          disabled={isCover}
          style={{
            padding: "4px 12px", border: "1px solid #666", borderRadius: 4,
            background: isCover ? "var(--color-primary)" : "transparent",
            color: "#fff", cursor: isCover ? "default" : "pointer",
          }}
        >
          {isCover ? "已是封面" : "设为封面"}
        </button>

        {/* EXIF 切换 */}
        <button
          onClick={() => setShowExif(!showExif)}
          style={{
            padding: "4px 12px", border: "1px solid #666", borderRadius: 4,
            background: "transparent", color: "#fff", cursor: "pointer",
          }}
        >
          {showExif ? "隐藏 EXIF" : "显示 EXIF"}
        </button>

        {/* 导航计数 */}
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {index + 1} / {images.length}
        </span>
      </div>

      {/* EXIF 面板 */}
      {showExif && exif && (
        <div
          style={{
            position: "absolute", top: 16, right: 16,
            background: "rgba(0,0,0,0.8)", color: "#fff",
            padding: 12, borderRadius: 8, fontSize: 12,
            maxWidth: 300,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>EXIF 信息</h4>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
            {exif.camera && <><span>相机</span><span>{exif.camera}</span></>}
            {exif.lens && <><span>镜头</span><span>{exif.lens}</span></>}
            {exif.dateTime && <><span>时间</span><span>{exif.dateTime}</span></>}
            {exif.iso && <><span>ISO</span><span>{exif.iso}</span></>}
            {exif.aperture && <><span>光圈</span><span>{exif.aperture}</span></>}
            {exif.shutterSpeed && <><span>快门</span><span>{exif.shutterSpeed}</span></>}
            {exif.focalLength && <><span>焦距</span><span>{exif.focalLength}</span></>}
            {exif.width && <><span>尺寸</span><span>{exif.width} × {exif.height}</span></>}
          </div>
        </div>
      )}
    </div>
  )
}
