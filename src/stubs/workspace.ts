/** 本地类型桩 — workspace 的最小接口 */

/** useWorkspace() 返回的 workspace 对象 */
export interface Workspace {
  eventBus: {
    emit: (event: string, payload?: unknown) => void
    on: (event: string, handler: (payload: unknown) => void) => () => void
  }
  logger: {
    info: (msg: string, ...args: unknown[]) => void
    warn: (msg: string, ...args: unknown[]) => void
    error: (msg: string, ...args: unknown[]) => void
  }
  getProjectTypes(): Array<{ type: string; pluginId: string; pluginName: string }>
}

/** 从 React 上下文获取 workspace（宿主运行时注入，此处仅声明类型） */
export declare function useWorkspace(): Workspace
