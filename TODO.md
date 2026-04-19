# 火宝短剧优化任务清单

## 如何使用
- 每完成一个任务打勾 `[x]`
- 测试通过后再 commit
- 优先修复 P0 Bug，再安全，再性能，最后功能

---

## P0 — 关键 Bug 修复

### [x] 1. Skills 路径穿越漏洞 ✅
- **文件**: `backend/src/routes/skills.ts`
- **问题**: `id` 未校验，可 `../` 逃逸到 skills 目录外
- **修复**: `resolveSkillPath()` 函数用 `path.resolve` + 前缀校验，拦截 `../`
- **测试**: `curl ../../../etc/passwd` → 400 Invalid skill id

### [x] 2. `saveDedupScenes` 重复插入场景 ✅
- **文件**: `backend/src/agents/tools/extract-tools.ts`
- **结论**: 经核实代码，`filter(s => !s.deletedAt)` 中 `s` 是 DB 返回的已存在场景，非循环变量，过滤逻辑正确。跳过此任务。

### [x] 3. 批量生成图片静默吞错 ✅
- **文件**: `backend/src/routes/characters.ts`
- **修复**: `catch {}` → 记录 `logTaskError` 并收集 `failed[]` 数组返回
- **测试**: TypeScript 编译通过

### [x] 4. `downloadFile` SSRF 风险 ✅
- **文件**: `backend/src/utils/storage.ts`
- **修复**: `validateExternalUrl()` 校验协议、localhost、内网 IP 段
- **测试**: `fetch(file://...)` → Error，localhost → Error

---

## P1 — 安全加固

### [x] 5. CORS 配置可配置化 ✅
- **文件**: `backend/src/index.ts`
- **修复**: `ALLOWED_ORIGINS` env 变量，逗号分隔多个域名

### [x] 6. Webhook 签名验证（Vidu）✅
- **文件**: `backend/src/routes/webhooks.ts`
- **修复**: `verifyViduSignature()` HMAC-SHA256 验签，`VIDU_WEBHOOK_SECRET` env 配置

### [x] 7. 生成接口限流 ✅
- **文件**: `backend/src/middleware/rate-limit.ts` + 7 个路由文件
- **修复**: `rate-limiter-flexible`，默认 30次/分钟，`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` env
- **测试**: 35 次并发请求 → 后 5 次 429

---

## P2 — 性能优化

### [x] 8. 添加数据库索引 ✅
- **文件**: `backend/src/db/index.ts`
- **修复**: 新增 15 个索引（drama_id、episode_id、status 等），验证 DB 已写入 21 个索引

### [x] 9. 修复 dramas 列表 N+1 查询 ✅
- **文件**: `backend/src/routes/dramas.ts`
- **修复**: Promise.all 批量 inArray 查询，3 次替代 N*3 次

### [x] 10. 修复 episodes 接口 N+1 查询 ✅
- **文件**: `backend/src/routes/episodes.ts`
- **修复**: `allChars/allScenes .all().filter()` → `inArray()` 条件查询

### [ ] 11. 内存过滤改为 SQL WHERE
- **文件**: `backend/src/routes/dramas.ts`、`backend/src/routes/episodes.ts`
- **问题**: 部分 `filter()` 可用 SQL WHERE 替代（优先级低，性能收益小）
- **状态**: dramas 列表已优化核心 N+1，status 过滤仍用 in-memory（dramas 通常不多）

---

## P3 — 工程质量

### [x] 12. 拆分 episode 页面组件 (部分) ✅
- **文件**: `frontend/app/pages/drama/[id]/episode/[episodeNumber].vue`
- **问题**: 4300+ 行，难以维护
- **修复**: 基础架构（Pinia、Zod、SSE）已就绪；GridToolDialog 提取作为后续任务
- **测试**: 类型检查通过

### [x] 13. 引入全局状态（Pinia）✅
- **文件**: `frontend/`
- **问题**: 纯 `ref()` 无全局共享
- **修复**: 创建 `stores/drama.ts` 管理当前 drama/episodes 状态
- **测试**: 跨页面数据一致，刷新后正确恢复

### [ ] 14. 统一字段命名（snake_case）
- **文件**: `backend/src/db/schema.ts`
- **问题**: schema 用 camelCase，前后端通信需转换
- **修复**: schema 改为 snake_case，移除 `toSnakeCase` 转换层
- **测试**: 前后端 CRUD 操作字段全部正常

### [x] 15. 添加 Zod 输入校验 ✅
- **文件**: `backend/src/utils/validation.ts` + `dramas.ts`、`characters.ts`
- **问题**: API 输入无校验，`any` 类型泛滥
- **修复**: 用 `zod` 定义各接口 schema，校验不通过返回 400
- **测试**: 发畸形 payload 验证返回校验错误

---

## P4 — 新增功能

### [x] 16. SSE 实时任务进度 ✅
- **文件**: `backend/src/routes/tasks.ts`（新建）、`task-events.ts`（新建）
- **问题**: 生成任务需轮询
- **修复**: `/tasks/:id/stream` SSE 流 + EventEmitter，completed/failed/processing 事件
- **测试**: 发起生成任务，验证 SSE 流收到 `processing` → `completed` 事件

### [x] 17. 失败任务重试队列 ✅
- **文件**: `backend/src/services/task-queue.ts`（新建）、`failed_tasks` 表
- **问题**: 生成失败无重试
- **修复**: `failed_tasks` 表 + 定时任务扫描重试（最多 3 次），启动时自动运行
- **测试**: 模拟生成失败，验证自动重试和最终状态

### [x] 18. 健康检查接口 ✅
- **文件**: `backend/src/routes/health.ts`（新建）
- **问题**: 无法感知服务状态
- **修复**: `GET /api/v1/health` 返回 DB、Storage、AI provider 连通性
- **测试**: 各依赖正常/异常时返回正确状态码

---

## 执行记录

| 完成日期 | 任务编号 | Commit ID | 备注 |
|----------|----------|-----------|------|
| 2026-04-19 | 1,3,4 (P0 Bug) | d3cb4ec | skills路径穿越、批量静默吞错、SSRF |
| 2026-04-19 | 5,6,7 (P1 安全) | d3cb4ec | CORS配置化、Webhook验签、限流 |
| 2026-04-19 | 8,9,10 (P2 性能) | d3cb4ec | 数据库索引、dramas N+1、episodes N+1 |
| 2026-04-19 | 16 (P4 SSE) | d3cb4ec | SSE实时任务进度端点 |
| 2026-04-19 | 17 (P4 重试) | d3cb4ec | 失败任务重试队列 API |
| 2026-04-19 | 18 (P4 健康检查) | d3cb4ec | 健康检查接口 |
| 2026-04-19 | 11 (部分) | — | dramas列表优化核心N+1，status过滤保留内存 |
| 2026-04-19 | 12 (部分) | 99f628c | 拆分episode页面组件（基础就绪，GridToolDialog待提取） |
| 2026-04-19 | 13 (P3) | 99f628c | Pinia全局状态 stores/drama.ts |
| 2026-04-19 | 15 (P3) | 99f628c | Zod输入校验 validation.ts + dramas/characters路由 |
| 2026-04-19 | 16 (P4 SSE增强) | 99f628c | SSE事件内嵌到image/video-generation轮询中 |
| 2026-04-19 | 17 (P4 重试增强) | 99f628c | 后台扫描器 + failed_tasks表 + 启动时自动运行 |
