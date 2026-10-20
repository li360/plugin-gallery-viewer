# HANDOFF — 图库插件交接

> 更新：2026-10-21 · 当前版本：**0.6.0**

## 1. 当前状态

- 0.6.0 已发布到 GitHub Release，并已进入社区 registry
- 源码已提交/推送（`ff85ffc`）
- 新增：迷你地图区域筛选、轨迹视图、地点相册增强
- 最低宿主 0.32.0；建议 0.36.3+（首开修复、主页入口、更新回退）

## 2. 主要能力

- 网格 / 灯箱 / 多选批量
- 排序、搜索、星标、日期范围
- EXIF 方向/相机/镜头/ISO/光圈筛选
- 封面、分组、地点相册、迷你地图区域筛选
- 时间线、轨迹视图
- 配置写回 `.projmeta.json`（500ms 防抖）

## 3. 已知问题 / 技术债

1. **依赖 `../MyProj` 源码**：`tsconfig` paths 引用 `plugin-protocol` / `kmgr-api` / `map-core`。
   - 交接给外部开发者时，需要同级主仓库，或先迁移到 SDK。
   - `map-core` 尚未提供独立 SDK tarball。
2. **无自动化测试**：只有 typecheck/build + 手动矩阵；`utils.ts` 的筛选函数适合补单测。
3. **配置写回为最后写入者胜**：同一项目两个实例同时改配置可能互相覆盖。
4. **大目录性能**：需确认虚拟化/分页覆盖所有视图；EXIF/GPS 回填在超大目录下仍需观察。
5. **地图依赖在线底图/归档**：离线或归档缺失时只保证降级，不保证完整地图。
6. **0.6.0 发布时源码曾未提交**：已在交接前补提交 `ff85ffc`，后续发布必须先提交再打包。

## 4. 接手第一周建议

1. 读 [AGENTS.md](./AGENTS.md) → [CONTRACT.md](./CONTRACT.md) → [ARCHITECTURE.md](./ARCHITECTURE.md)
2. 跑通 typecheck/build
3. 用 `TESTING.md` 跑基础 + 网格 + 灯箱
4. 复现并记录已知问题
5. 先做小 PR（文案/纯函数单测），不要先动配置写回/地图核心

## 5. 下一阶段候选

- `utils.ts` 纯函数单测（排序/筛选/迁移）
- 大目录虚拟化确认
- 配置写回冲突策略（按实例合并或锁）
- `map-core` SDK 化
- 视觉回归/截图测试（可选）

## 6. 入口

- 通用插件文档：<https://li360.github.io/gewu-site/plugin-development/>
- 发布脚本：`E:\GeWu\MyProj\scripts\publish-plugin.ps1`
- 社区注册表：<https://github.com/li360/gewu-plugins-registry>
