/** 图库插件内部类型定义 */

/** 缩略图档位 — 控制网格密度 */
export type ThumbnailSize = "sm" | "md" | "lg" | "xl"

/** 排序键 */
export type SortKey = "name" | "modified" | "size" | "rating"

/** 排序方向 */
export type SortDir = "asc" | "desc"

/** 图片文件条目（经扫描过滤后的有效图片，含排序所需字段） */
export interface ImageEntry {
  /** 绝对路径 */
  path: string
  /** 文件名（含扩展名） */
  name: string
  /** POSIX 相对路径（相对于 .proj 根）—— 用于写入 meta 与多选标识 */
  relPath: string
  /** 子目录分组键（如 "2024/旅行"，根目录为空串） */
  groupKey: string
  /** 扩展名（小写含点） */
  ext: string
  /** 文件大小（字节）—— 排序用 */
  size: number
  /** 最后修改时间 ISO 8601 —— 排序用 */
  modifiedAt?: string
}

/**
 * 单图元数据 — 写入 .projmeta.json 的 gallery.metas[relPath]
 *
 * 设计原则：
 *  - 仅在用户操作或 AI 处理后写入，未触碰的图不写空对象
 *  - AI 字段为预留扩展点，gewu 集成 AI 后由 ImageAnnotationService 填充
 */
export interface ImageMeta {
  /** 用户打星 1-5；0 或缺省表示未评 */
  rating?: number
  /** 用户手动标签 */
  tags?: string[]
  /** 用户自定义排序权重（数字越小越靠前） */
  customOrder?: number

  // ===== AI 预留字段（未来 AI 集成时填充，不阻塞 MVP） =====
  /** AI 生成标签（人物 / 场景 / 物体 / 风格） */
  aiTags?: string[]
  /** AI 生成自然语言描述 */
  aiCaption?: string
  /** 语义聚类 ID（同主题/同事件归簇） */
  aiClusterId?: string
  /** 画质 / 相关性评分（0-1） */
  aiScore?: number
  /** 感知哈希（pHash，重复检测用） */
  phash?: string
  /** EXIF 摘要（缓存，避免重复解析二进制） */
  exif?: Record<string, unknown>
}

/** 图库类型专属配置段（.projmeta.json 的 gallery 键） */
export interface GalleryConfig {
  /** 封面图相对路径 */
  cover?: string
  /** 单图元数据表 —— MVP 主存储 */
  metas?: Record<string, ImageMeta>
  /**
   * 旧版评分表 —— 仅用于加载历史 .projmeta.json 时迁移到 metas[relPath].rating
   * 新写入不再使用此字段
   * @deprecated 改用 metas[relPath].rating
   */
  ratings?: Record<string, number>
  /** 分组方式：folder（按子目录）| date（按修改日期）| none（不分组） */
  groupBy?: "folder" | "date" | "none"
  /** 包含规则（glob，可选） */
  include?: string[]
  /** 排除规则（glob，可选） */
  exclude?: string[]
  /** 缩略图档位，缺省 md */
  thumbnailSize?: ThumbnailSize
  /** 排序键，缺省 name */
  sortBy?: SortKey
  /** 排序方向，缺省 asc */
  sortDir?: SortDir
  /** 星标筛选下限（仅显示 rating >= 此值的图），0 或缺省 = 不筛选 */
  minRating?: number
  /** 视图模式：grid 网格（缺省）/ map 地点相册 */
  viewMode?: "grid" | "map"
  /** 日期范围筛选（按修改时间，YYYY-MM-DD；from/to 任一为空表示该端不限） */
  dateRange?: { from?: string; to?: string }
}

/** 灯箱状态 */
export interface LightboxState {
  /** 当前显示图片在 filteredImages 中的索引 */
  index: number
  /** 缩放级别（1 = 适应屏幕，>1 放大） */
  zoom: number
  /** 旋转角度（0/90/180/270） */
  rotation: number
  /** 是否全屏 */
  fullscreen: boolean
}
