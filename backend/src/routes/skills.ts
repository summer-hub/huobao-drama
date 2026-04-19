import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { success, badRequest } from '../utils/response.js'

const app = new Hono()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '../../../skills')

// GET /skills — List all skills (recursive, supports nested dirs)
app.get('/', async (c) => {
  const skills: { id: string; name: string; description: string }[] = []

  if (!fs.existsSync(SKILLS_DIR)) {
    return success(c, skills)
  }

  function scanDir(dir: string, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(dir, entry.name)
      const skillPath = path.join(fullPath, 'SKILL.md')
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf-8')
        const nameMatch = content.match(/^name:\s*(.+)$/m)
        const descMatch = content.match(/^description:\s*(.+)$/m)
        const id = prefix ? `${prefix}/${entry.name}` : entry.name
        skills.push({
          id,
          name: nameMatch ? nameMatch[1].trim() : entry.name,
          description: descMatch ? descMatch[1].trim() : '',
        })
      }
      // Always recurse — nested skills may exist even if this dir has SKILL.md
      scanDir(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name)
    }
  }

  scanDir(SKILLS_DIR)
  return success(c, skills)
})

function resolveSkillPath(id: string): { safe: boolean; filePath?: string } {
  const sanitized = id.replace(/\.\./g, '')
  const resolved = path.resolve(SKILLS_DIR, sanitized, 'SKILL.md')
  if (!resolved.startsWith(SKILLS_DIR)) return { safe: false }
  return { safe: true, filePath: resolved }
}

// GET /skills/:id — Get skill content
app.get('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const { safe, filePath } = resolveSkillPath(id)
  if (!safe || !filePath) return badRequest(c, 'Invalid skill id')
  if (!fs.existsSync(filePath)) return badRequest(c, 'Skill not found')
  const content = fs.readFileSync(filePath, 'utf-8')
  return success(c, { id, content })
})

// PUT /skills/:id — Update skill content
app.put('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const { safe, filePath } = resolveSkillPath(id)
  if (!safe || !filePath) return badRequest(c, 'Invalid skill id')
  const body = await c.req.json()
  const skillDir = path.dirname(filePath)
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(filePath, body.content, 'utf-8')
  return success(c)
})

// POST /skills — Create new skill directory
app.post('/', async (c) => {
  const body = await c.req.json()
  const { id, name, description } = body
  if (!id) return badRequest(c, 'Skill id is required')

  const sanitizedId = id.replace(/\.\./g, '')
  const resolved = path.resolve(SKILLS_DIR, sanitizedId)
  if (!resolved.startsWith(SKILLS_DIR)) return badRequest(c, 'Invalid skill id')
  if (fs.existsSync(resolved)) return badRequest(c, 'Skill already exists')

  fs.mkdirSync(resolved, { recursive: true })
  const content = `---
name: ${name || id}
description: ${description || ''}
---

# ${name || id}

Write your skill content here.
`
  fs.writeFileSync(path.join(resolved, 'SKILL.md'), content, 'utf-8')
  return success(c, { id, name: name || id, description: description || '' })
})

// DELETE /skills/:id — Delete skill directory
app.delete('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const sanitized = id.replace(/\.\./g, '')
  const resolved = path.resolve(SKILLS_DIR, sanitized)
  if (!resolved.startsWith(SKILLS_DIR)) return badRequest(c, 'Invalid skill id')
  if (!fs.existsSync(resolved)) return badRequest(c, 'Skill not found')
  fs.rmSync(resolved, { recursive: true, force: true })
  return success(c)
})

export default app
