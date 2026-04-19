/**
 * 健康检查接口
 * GET /health
 * 返回: { status: 'ok'|'degraded', checks: { db, storage, timestamp } }
 */
import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

const app = new Hono()

app.get('/', async (c) => {
  const checks: Record<string, { ok: boolean; detail: string }> = {}
  let overall = 'ok'

  // 1. Database
  try {
    const { db, schema } = await import('../db/index.js')
    db.select().from(schema.dramas).limit(1).all()
    checks.db = { ok: true, detail: 'SQLite connected' }
  } catch (err: any) {
    checks.db = { ok: false, detail: err.message }
    overall = 'degraded'
  }

  // 2. Storage
  try {
    const testFile = path.join(STORAGE_ROOT, '.health_check')
    fs.writeFileSync(testFile, Date.now().toString())
    fs.unlinkSync(testFile)
    checks.storage = { ok: true, detail: 'writable' }
  } catch (err: any) {
    checks.storage = { ok: false, detail: err.message }
    overall = 'degraded'
  }

  // 3. Timestamp
  checks.timestamp = { ok: true, detail: new Date().toISOString() }

  const status = overall === 'ok' ? 200 : 503
  return c.json({ status: overall, checks }, status)
})

export default app
