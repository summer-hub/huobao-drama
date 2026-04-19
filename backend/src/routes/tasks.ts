/**
 * 任务重试接口
 * POST /tasks/retry/image/:id — 重试图片生成
 * POST /tasks/retry/video/:id — 重试视频生成
 * GET /tasks/:id/stream — SSE 实时推送任务状态
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { logTaskError, logTaskProgress } from '../utils/task-logger.js'
import { taskEvents } from '../services/task-events.js'

const app = new Hono()

/**
 * 根据 serviceType + provider 获取活跃配置
 */
function getActiveConfigByProvider(serviceType: string, provider: string) {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
    .all()
    .filter(r => r.isActive && r.provider === provider)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  return rows[0] || null
}

// GET /tasks/:id/stream — SSE 实时推送
app.get('/:id/stream', async (c) => {
  const taskId = Number(c.req.param('id'))
  if (!taskId) return badRequest(c, 'Invalid task id')

  return streamSSE(c, async (stream) => {
    const encoder = new TextEncoder()

    // 发送初始 ping
    await stream.write(`data: ${JSON.stringify({ event: 'connected', taskId })}\n\n`)

    const handler = (payload: any) => {
      stream.write(`data: ${JSON.stringify({ ...payload, taskId })}\n\n`).catch(() => {})
    }

    taskEvents.onTask(taskId, handler)

    // 保持连接，发送心跳
    let heartbeatCount = 0
    const heartbeat = setInterval(() => {
      heartbeatCount++
      stream.write(`: heartbeat ${heartbeatCount}\n\n`).catch(() => {
        clearInterval(heartbeat)
        taskEvents.offTask(taskId, handler)
      })
    }, 25000)

    // 最多保持 10 分钟
    setTimeout(() => {
      clearInterval(heartbeat)
      taskEvents.offTask(taskId, handler)
      stream.write(`data: ${JSON.stringify({ event: 'timeout', taskId })}\n\n}`).catch(() => {})
    }, 10 * 60 * 1000)
  })
})

// POST /tasks/retry/image/:id
app.post('/retry/image/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const rows = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]
  if (!record) return badRequest(c, 'Image task not found')

  const provider = record.provider || 'chatfire'
  const cfg = getActiveConfigByProvider('image', provider)
  if (!cfg) return badRequest(c, `No active image config for provider: ${provider}`)
  const config = { provider: provider, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model || record.model || '' }

  const { processImageGeneration } = await import('../services/image-generation.js')

  db.update(schema.imageGenerations)
    .set({ status: 'processing', errorMsg: null })
    .where(eq(schema.imageGenerations.id, id)).run()

  logTaskProgress('TaskAPI', 'retry-image', { id, provider })
  processImageGeneration(id, config).catch((err: any) => {
    logTaskError('TaskAPI', 'retry-image-failed', { id, error: err.message })
  })

  return success(c, { message: 'Retry started', id })
})

// POST /tasks/retry/video/:id
app.post('/retry/video/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const rows = db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id)).all()
  const record = rows[0]
  if (!record) return badRequest(c, 'Video task not found')

  const provider = record.provider || 'chatfire'
  const cfg = getActiveConfigByProvider('video', provider)
  if (!cfg) return badRequest(c, `No active video config for provider: ${provider}`)
  const config = { provider: provider, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model || record.model || '' }

  const { processVideoGeneration } = await import('../services/video-generation.js')

  db.update(schema.videoGenerations)
    .set({ status: 'processing', errorMsg: null })
    .where(eq(schema.videoGenerations.id, id)).run()

  logTaskProgress('TaskAPI', 'retry-video', { id, provider })
  processVideoGeneration(id, config).catch((err: any) => {
    logTaskError('TaskAPI', 'retry-video-failed', { id, error: err.message })
  })

  return success(c, { message: 'Retry started', id })
})

export default app
