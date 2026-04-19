/**
 * 限流中间件 — 保护生成类接口
 * 配置通过环境变量：
 *   RATE_LIMIT_WINDOW_MS  — 时间窗口（ms），默认 60000（1分钟）
 *   RATE_LIMIT_MAX       — 每窗口最大请求数，默认 30
 */
import { Next } from 'hono'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import type { Context } from 'hono'

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
const maxRequests = Number(process.env.RATE_LIMIT_MAX) || 30

const rateLimiter = new RateLimiterMemory({
  points: maxRequests,
  duration: Math.ceil(windowMs / 1000),
  blockDuration: 60,
})

export async function rateLimitMiddleware(c: Context, next: Next) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip')
    || 'unknown'

  try {
    const result = await rateLimiter.consume(ip)
    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(result.remainingPoints))
    c.header('X-RateLimit-Reset', String(Math.ceil((Date.now() + result.msBeforeNext) / 1000)))
  } catch {
    return c.json({ code: 429, message: '请求过于频繁，请稍后再试' }, 429)
  }

  await next()
}
