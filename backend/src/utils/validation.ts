/**
 * Zod input validation schemas for API routes
 */
import { z } from 'zod'

// ─── Drama ───────────────────────────────────────────────────────────────────

export const CreateDramaSchema = z.object({
  title: z.string().min(1, 'title is required').max(200),
  description: z.string().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  tags: z.array(z.string()).optional(),
  total_episodes: z.number().int().min(1).max(999).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const UpdateDramaSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived'], { message: 'status must be draft, published, or archived' }).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

// ─── Episode ─────────────────────────────────────────────────────────────────

export const CreateEpisodeSchema = z.object({
  drama_id: z.number().int().positive(),
  episode_number: z.number().int().min(1),
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  script_content: z.string().optional(),
})

export const UpdateEpisodeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  script_content: z.string().optional(),
  status: z.enum(['draft', 'processing', 'completed'], { message: 'status must be draft, processing, or completed' }).optional(),
})

// ─── Character ────────────────────────────────────────────────────────────────

export const GenerateCharacterImageSchema = z.object({
  episode_id: z.number().int().positive('episode_id is required'),
})

export const BatchGenerateCharacterImagesSchema = z.object({
  character_ids: z.array(z.number().int().positive()).min(1, 'at least one character_id is required'),
  episode_id: z.number().int().positive('episode_id is required'),
})

export const GenerateVoiceSampleSchema = z.object({
  episode_id: z.number().int().positive('episode_id is required'),
})

// ─── Scene ───────────────────────────────────────────────────────────────────

export const CreateSceneSchema = z.object({
  drama_id: z.number().int().positive(),
  location: z.string().min(1).max(200),
  time: z.string().optional(),
  prompt: z.string().optional(),
})

export const UpdateSceneSchema = z.object({
  location: z.string().min(1).max(200).optional(),
  time: z.string().optional(),
  prompt: z.string().optional(),
  status: z.enum(['pending', 'completed'], { message: 'status must be pending or completed' }).optional(),
})

// ─── Storyboard ──────────────────────────────────────────────────────────────

export const UpdateStoryboardSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  shot_type: z.string().optional(),
  angle: z.string().optional(),
  movement: z.string().optional(),
  duration: z.number().int().min(1).max(60).optional(),
  location: z.string().optional(),
  time: z.string().optional(),
  dialogue: z.string().optional(),
  action: z.string().optional(),
  result: z.string().optional(),
  atmosphere: z.string().optional(),
  image_prompt: z.string().optional(),
  video_prompt: z.string().optional(),
  bgm_prompt: z.string().optional(),
  sound_effect: z.string().optional(),
  scene_id: z.number().int().positive().nullable().optional(),
  character_ids: z.array(z.number().int().positive()).optional(),
})

// ─── AI Config ────────────────────────────────────────────────────────────────

export const UpsertAiConfigSchema = z.object({
  provider: z.string().min(1),
  service_type: z.enum(['image', 'video', 'audio', 'tts'], { message: 'service_type must be image, video, audio, or tts' }),
  model: z.string().optional(),
  base_url: z.string().url().optional().or(z.literal('')),
  api_key: z.string().optional(),
  is_active: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
})

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Parse and validate a request body, returning 400 on failure.
 * Usage: const body = await validateBody(c, CreateDramaSchema)
 */
export async function validateBody<T>(c: any, schema: z.ZodSchema<T>): Promise<T> {
  const body = await c.req.json().catch(() => ({}))
  const result = schema.safeParse(body)
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')
    throw Object.assign(new Error(`Validation failed: ${errors}`), { status: 400 })
  }
  return result.data
}
