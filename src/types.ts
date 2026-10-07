/** 图库插件内部类型定义 */

/** 图片文件条目（经扫描过滤后的有效图片） */
export interface ImageEntry {
  /** 绝对路径 */
  path: string
  /** 文件名（含扩展名） */
  name: string
  /** POSIX 相对路径（相对于 .proj 根）—— 用于写入 meta */
  relPath: string
  /** 子目录分组键（如 "2024/旅行"） */
  groupKey: string
  /** 扩展名（小写） */
  ext: string
}

/** 图库类型专属配置段（.projmeta.json 的 gallery 键） */
export interface GalleryConfig {
  /** 封面图相对路径 */
  cover?: string
  /** 评分表：相对路径 → 1-5 */
  ratings?: Record<string, number>
  /** 分组方式：folder（按子目录）| date（按修改日期）| none（不分组） */
  groupBy?: "folder" | "date" | "none"
  /** 包含规则（glob，可选） */
  include?: string[]
  /** 排除规则（glob，可选） */
  exclude?: string[]
}

/** 灯箱状态 */
export interface LightboxState {
  /** 当前显示图片在 filteredImages 中的索引 */
  index: number
  /** 缩放级别（1 = 原始大小） */
  zoom: number
}
