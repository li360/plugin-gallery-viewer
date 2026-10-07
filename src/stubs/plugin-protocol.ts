/** 本地类型桩 — 从 monorepo 的 plugin-protocol 复制最小运行时接口
 *  目的：解耦，避免依赖 monorepo 的私有包
 *  同步点：plugin-protocol/src/plugin.ts, plugin-protocol/src/project.ts
 */

// ======================== 从 plugin.ts 拷贝 ========================

/** 插件运行时上下文 */
export interface PluginContext {
  containerId: string
  emit: (event: string, payload?: Record<string, unknown>) => void
  on: (event: string, handler: (payload: unknown) => void) => () => void
  kmgr?: unknown
  pluginData?: unknown
  editor?: unknown
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
}

/** 文件模板 */
export interface FileTemplate {
  extension: string
  name: string
  icon: string
}

/** 事件路由载荷基类 */
export interface RoutedPayload {
  __sourceContainer?: string
  __targetContainer?: string
  openIn?: "new"
  [key: string]: unknown
}

/** 项目元数据 — .projmeta.json 的解析结果 */
export interface ProjectMeta {
  id: string
  version: number
  type: string
  title?: string
  createdAt?: string
  updatedAt?: string
  [typeConfig: string]: unknown
}

/** 插件 Manifest */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  emits?: string[]
  handles?: string[]
  preferredExtensions?: string[]
  projectTypes?: string[]
  isEditor?: boolean
  layoutHints?: { preferredWeight?: number }
  capabilities?: string[]
  statusBarItems?: Array<{ id: string; label: string; value: string; priority?: number }>
  component?: React.ComponentType<PluginContext>
  templates?: FileTemplate[]
}

// ======================== 从 project.ts 拷贝 ========================

/** 项目目录扩展名 */
export const PROJ_EXTENSION = ".proj"

/** 项目元数据文件名 */
export const PROJ_META_FILENAME = ".projmeta.json"

/** 项目 ID 前缀 */
export const PROJ_ID_PREFIX = "proj-"

/** 当前 .projmeta.json 格式版本 */
export const PROJ_META_VERSION = 1

/** 判断目录名是否为项目目录 */
export function isProjDirName(name: string): boolean {
  return name.toLowerCase().endsWith(PROJ_EXTENSION)
}

/** 生成新项目 ID */
export function generateProjectId(): string {
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0")
  return `${PROJ_ID_PREFIX}${hex()}`
}

// ======================== 多实例过滤 ========================

/** 创建多实例事件过滤器 */
export function createMultiInstanceFilter(containerId: string) {
  const isDynamic = containerId.includes("#")
  return (payload: { __targetContainer?: string; openIn?: string }) => {
    if (payload.__targetContainer !== undefined) {
      return payload.__targetContainer === containerId
    }
    if (isDynamic) return false
    if (payload.openIn === "new") return false
    return true
  }
}
