import { Hono } from 'hono'
import { eq, isNull, like, desc, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, notFound, created, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { CreateDramaSchema, UpdateDramaSchema, validateBody } from '../utils/validation.js'

const app = new Hono()

// GET /dramas - List dramas
app.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1)
  const pageSize = Number(c.req.query('page_size') || 20)
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')

  const allRows = await db.select().from(schema.dramas)
    .where(isNull(schema.dramas.deletedAt))
    .orderBy(desc(schema.dramas.updatedAt))

  let filtered = status ? allRows.filter(d => d.status === status) : allRows
  const total = filtered.length
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const kwItems = keyword ? filtered.filter(d => d.title.toLowerCase().includes(keyword.toLowerCase())) : null
  const finalItems = kwItems ? kwItems.slice((page - 1) * pageSize, page * pageSize) : pageItems

  if (!finalItems.length) {
    return success(c, { items: [], pagination: { page, page_size: pageSize, total, total_pages: 0 } })
  }

  const dramaIds = finalItems.map(d => d.id)

  // 批量 IN 查询替代 N+1（3次查询 vs N*3）
  const [epsResult, charsResult, scnsResult] = await Promise.all([
    db.select().from(schema.episodes).where(inArray(schema.episodes.dramaId, dramaIds)).all(),
    db.select().from(schema.characters).where(inArray(schema.characters.dramaId, dramaIds)).all(),
    db.select().from(schema.scenes).where(inArray(schema.scenes.dramaId, dramaIds)).all(),
  ])

  const groupBy = <T extends { dramaId: number }>(rows: T[]) => {
    const m = new Map<number, T[]>()
    for (const r of rows) { const arr = m.get(r.dramaId) || []; arr.push(r); m.set(r.dramaId, arr) }
    return m
  }
  const epsByDid = groupBy(epsResult)
  const charsByDid = groupBy(charsResult)
  const scnsByDid = groupBy(scnsResult)

  const enriched = finalItems.map(d => ({
    ...toSnakeCase(d),
    tags: d.tags ? JSON.parse(d.tags) : [],
    episodes: toSnakeCaseArray(epsByDid.get(d.id) || []),
    characters: toSnakeCaseArray(charsByDid.get(d.id) || []),
    scenes: toSnakeCaseArray(scnsByDid.get(d.id) || []),
  }))

  return success(c, {
    items: enriched,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  })
})

// POST /dramas - Create drama
app.post('/', async (c) => {
  let body: Record<string, any>
  try {
    body = await validateBody(c, CreateDramaSchema)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const ts = now()
  const res = db.insert(schema.dramas).values({
    title: body.title,
    description: body.description,
    genre: body.genre,
    style: body.style,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    metadata: body.metadata,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const [result] = db.select().from(schema.dramas)
    .where(eq(schema.dramas.id, Number(res.lastInsertRowid))).all()

  // Create default episodes
  const totalEpisodes = body.total_episodes || 1
  for (let i = 1; i <= totalEpisodes; i++) {
    db.insert(schema.episodes).values({
      dramaId: result.id,
      episodeNumber: i,
      title: `第${i}集`,
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    }).run()
  }

  return created(c, toSnakeCase(result))
})


// GET /dramas/stats — must be before /:id
app.get('/stats', async (c) => {
  const all = db.select().from(schema.dramas).where(isNull(schema.dramas.deletedAt)).all()
  const byStatus = Object.entries(
    all.reduce((acc, d) => {
      acc[d.status || 'draft'] = (acc[d.status || 'draft'] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({ status, count }))
  return success(c, { total: all.length, by_status: byStatus })
})

// GET /dramas/:id - Get drama detail
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, id))
  if (!drama) return notFound(c, '剧本不存在')

  const eps = await db.select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, id))
  const chars = await db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, id))
  const scns = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, id))
  const prps = await db.select().from(schema.props)
    .where(eq(schema.props.dramaId, id))

  return success(c, {
    ...toSnakeCase(drama),
    tags: drama.tags ? JSON.parse(drama.tags) : [],
    episodes: toSnakeCaseArray(eps),
    characters: toSnakeCaseArray(chars),
    scenes: toSnakeCaseArray(scns),
    props: toSnakeCaseArray(prps),
  })
})

// PUT /dramas/:id - Update drama
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  let body: Record<string, any>
  try {
    body = await validateBody(c, UpdateDramaSchema)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.genre !== undefined) updates.genre = body.genre
  if (body.style !== undefined) updates.style = body.style
  if (body.status !== undefined) updates.status = body.status
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  if (body.metadata !== undefined) updates.metadata = body.metadata
  db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, id)).run()
  return success(c)
})

// DELETE /dramas/:id - Soft delete
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.dramas).set({ deletedAt: now() }).where(eq(schema.dramas.id, id))
  return success(c)
})

// PUT /dramas/:id/characters - Save characters
app.put('/:id/characters', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  const chars = body.characters || []
  const ts = now()

  for (const char of chars) {
    if (char.id) {
      await db.update(schema.characters).set({ ...char, updatedAt: ts }).where(eq(schema.characters.id, char.id))
    } else {
      await db.insert(schema.characters).values({ ...char, dramaId, createdAt: ts, updatedAt: ts })
    }
  }
  return success(c)
})

// PUT /dramas/:id/episodes - Save episodes
app.put('/:id/episodes', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  const episodes = body.episodes || []
  const ts = now()

  for (const ep of episodes) {
    if (ep.id) {
      await db.update(schema.episodes).set({ ...ep, updatedAt: ts }).where(eq(schema.episodes.id, ep.id))
    } else {
      await db.insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber: ep.episode_number || ep.episodeNumber || 1,
        title: ep.title || '未命名',
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }
  return success(c)
})

export default app
