/**
 * 失败任务重试队列
 * 提供注册失败任务、查询状态、重试接口
 */
import { db, schema } from '../db/index.js'
import { eq, and, lte, desc } from 'drizzle-orm'
import { logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'

const MAX_RETRIES = 3

/**
 * 记录一个失败任务
 */
export function registerFailedTask(taskType: 'image' | 'video', originalId: number, errorMsg: string) {
  const ts = new Date().toISOString()
  db.insert(schema.failedTasks).values({
    originalTable: taskType === 'image' ? 'image_generations' : 'video_generations',
    originalId,
    taskType,
    params: null,
    errorMsg: errorMsg.slice(0, 500),
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    status: 'pending',
    createdAt: ts,
    nextRetryAt: ts,
  }).run()
}

/**
 * 获取所有待重试任务
 */
export function getPendingRetries() {
  const now = new Date().toISOString()
  return db.select().from(schema.failedTasks)
    .where(
      and(
        eq(schema.failedTasks.status, 'pending'),
        lte(schema.failedTasks.nextRetryAt, now),
      )
    )
    .orderBy(desc(schema.failedTasks.createdAt))
    .all()
}

/**
 * 获取失败任务列表（供 API 调用）
 */
export function listFailedTasks(limit = 50) {
  return db.select().from(schema.failedTasks)
    .orderBy(desc(schema.failedTasks.createdAt))
    .limit(limit)
    .all()
}

/**
 * 重试一个失败任务（通过 original_id 重新触发处理）
 */
export async function retryFailedTask(taskId: number) {
  const [task] = db.select().from(schema.failedTasks)
    .where(eq(schema.failedTasks.id, taskId)).all()
  if (!task) return { ok: false, error: 'Task not found' }
  if ((task.retryCount ?? 0) >= (task.maxRetries ?? MAX_RETRIES)) {
    db.update(schema.failedTasks).set({ status: 'max_retries' })
      .where(eq(schema.failedTasks.id, taskId)).run()
    return { ok: false, error: 'Max retries exceeded' }
  }

  const attempt = (task.retryCount ?? 0) + 1
  logTaskProgress('TaskQueue', 'retry-start', { taskId, originalId: task.originalId, attempt })

  try {
    if (task.taskType === 'image') {
      const rows = db.select().from(schema.imageGenerations)
        .where(eq(schema.imageGenerations.id, task.originalId)).all()
      if (!rows.length) return { ok: false, error: 'Original image task not found' }
      const record = rows[0]
      if (!record) return { ok: false, error: 'Original image task not found' }

      const { getActiveConfig } = await import('./ai.js')
      const config = getActiveConfig('image')
      if (!config) return { ok: false, error: 'No active image config for retry' }

      const { processImageGeneration } = await import('./image-generation.js')
      // 重置状态为 processing
      db.update(schema.imageGenerations)
        .set({ status: 'processing', errorMsg: null })
        .where(eq(schema.imageGenerations.id, task.originalId)).run()
      processImageGeneration(task.originalId, config).catch((err: any) => {
        logTaskError('TaskQueue', 'retry-image-failed', { taskId, error: err.message })
      })
    } else if (task.taskType === 'video') {
      const rows = db.select().from(schema.videoGenerations)
        .where(eq(schema.videoGenerations.id, task.originalId)).all()
      if (!rows.length) return { ok: false, error: 'Original video task not found' }
      const record = rows[0]
      if (!record) return { ok: false, error: 'Original video task not found' }

      const { getActiveConfig } = await import('./ai.js')
      const config = getActiveConfig('video')
      if (!config) return { ok: false, error: 'No active video config for retry' }

      const { processVideoGeneration } = await import('./video-generation.js')
      db.update(schema.videoGenerations)
        .set({ status: 'processing', errorMsg: null })
        .where(eq(schema.videoGenerations.id, task.originalId)).run()
      processVideoGeneration(task.originalId, config).catch((err: any) => {
        logTaskError('TaskQueue', 'retry-video-failed', { taskId, error: err.message })
      })
    }

    const nextRetry = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    db.update(schema.failedTasks)
      .set({
        retryCount: attempt,
        status: 'retrying',
        nextRetryAt: nextRetry,
      })
      .where(eq(schema.failedTasks.id, taskId)).run()

    logTaskSuccess('TaskQueue', 'retry-dispatched', { taskId, attempt })
    return { ok: true, attempt }
  } catch (err: any) {
    db.update(schema.failedTasks)
      .set({ status: 'pending', nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
      .where(eq(schema.failedTasks.id, taskId)).run()
    return { ok: false, error: err.message }
  }
}

/**
 * 清理已完成的任务
 */
export function cleanupStaleTasks() {
  db.delete(schema.failedTasks)
    .where(eq(schema.failedTasks.status, 'completed'))
    .run()
}

// ─── Background Scanner ────────────────────────────────────────────────────────

let _scanTimer: ReturnType<typeof setInterval> | null = null

const SCAN_INTERVAL_MS = Number(process.env.RETRY_SCAN_INTERVAL_MS || 120_000)

/**
 * 启动后台重试扫描器
 * 每隔 SCAN_INTERVAL_MS 检查一次 pending 任务并触发重试
 */
export function startRetryScanner() {
  if (_scanTimer) return
  _scanTimer = setInterval(() => {
    runRetryScan().catch(err => {
      console.error('[RetryScanner] scan error:', err.message)
    })
  }, SCAN_INTERVAL_MS)
  console.log(`[RetryScanner] started (interval ${SCAN_INTERVAL_MS}ms)`)
}

/**
 * 停止后台重试扫描器
 */
export function stopRetryScanner() {
  if (_scanTimer) {
    clearInterval(_scanTimer)
    _scanTimer = null
    console.log('[RetryScanner] stopped')
  }
}

/**
 * 单次执行扫描 + 清理
 */
export async function runRetryScan() {
  const pending = getPendingRetries()
  if (pending.length === 0) return

  const { logTaskProgress } = await import('../utils/task-logger.js')
  logTaskProgress('RetryScanner', 'scan-run', { pendingCount: pending.length })

  for (const task of pending) {
    const result = await retryFailedTask(task.id)
    if (result.ok) {
      logTaskProgress('RetryScanner', 'retry-triggered', { taskId: task.id, originalId: task.originalId, attempt: result.attempt })
    }
  }

  cleanupStaleTasks()
}
