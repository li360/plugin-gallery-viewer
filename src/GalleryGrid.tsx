/** 图库网格视图 — 按子目录分组显示缩略图 */

import type { ImageEntry, GalleryConfig } from "./types"
import { groupByFolder, toAssetUrl } from "./utils"

interface Props {
  images: ImageEntry[]
  config: GalleryConfig
  onImageClick: (index: number) => void
  onSetCover: (relPath: string) => void
}

/** 图库网格组件 */
export function GalleryGrid({ images, config, onImageClick, onSetCover }: Props) {
  const groups = groupByFolder(images)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      {Array.from(groups.entries()).map(([groupName, groupImages]: [string, ImageEntry[]]) => (
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
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 8,
          }}>
            {groupImages.map((img) => {
              const globalIndex = images.findIndex((i) => i.path === img.path)
              const isCover = config.cover === img.relPath
              const rating = config.ratings?.[img.relPath] ?? 0
              return (
                <div
                  key={img.path}
                  onClick={() => onImageClick(globalIndex)}
                  style={{
                    position: "relative",
                    aspectRatio: "1",
                    borderRadius: 4,
                    overflow: "hidden",
                    cursor: "pointer",
                    border: isCover ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                    background: "var(--color-bg-secondary)",
                  }}
                >
                  <img
                    src={toAssetUrl(img.path)}
                    alt={img.name}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  {/* 评分显示 */}
                  {rating > 0 && (
                    <div style={{
                      position: "absolute", top: 4, right: 4,
                      background: "rgba(0,0,0,0.6)", color: "#fff",
                      padding: "2px 6px", borderRadius: 3,
                      fontSize: 11,
                    }}>
                      {"★".repeat(rating)}
                    </div>
                  )}
                  {/* 封面标记 */}
                  {isCover && (
                    <div style={{
                      position: "absolute", bottom: 4, left: 4,
                      background: "var(--color-primary)", color: "#fff",
                      padding: "2px 6px", borderRadius: 3,
                      fontSize: 11,
                    }}>
                      封面
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
