/**
 * ChatFire 视频生成 Adapter
 * ChatFire 视频服务实际在 /volcengine 路径下，使用火山引擎 Seedance API
 * 端点: /api/v3/contents/generations/tasks
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'

export class ChatFireVideoAdapter implements VideoProviderAdapter {
  provider = 'chatfire'

  private getBaseUrl(config: AIConfig): string {
    let baseUrl = (config.baseUrl || '').replace(/\/+$/, '')
    // 确保 baseUrl 包含 /volcengine 路径
    if (!baseUrl.includes('/volcengine')) {
      baseUrl = `${baseUrl}/volcengine`
    }
    return baseUrl
  }

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'doubao-seedance-1-5-pro-251215'

    const content: any[] = [{ type: 'text', text: record.prompt || '' }]

    if (record.referenceMode === 'single' && record.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: record.imageUrl } })
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) {
        content.push({ type: 'image_url', image_url: { url: record.firstFrameUrl }, role: 'first_frame' })
      }
      if (record.lastFrameUrl) {
        content.push({ type: 'image_url', image_url: { url: record.lastFrameUrl }, role: 'last_frame' })
      }
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      try {
        const refs = JSON.parse(record.referenceImageUrls)
        for (const url of refs) {
          content.push({ type: 'image_url', image_url: { url } })
        }
      } catch {}
    }

    const body: any = {
      model,
      content,
      generate_audio: true,
      ratio: record.aspectRatio || 'adaptive',
      duration: this.normalizeDuration(record.duration),
      watermark: false,
    }

    const baseUrl = this.getBaseUrl(config)

    return {
      url: `${baseUrl}/api/v3/contents/generations/tasks`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.id) {
      return { isAsync: true, taskId: result.id }
    }
    const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    const baseUrl = this.getBaseUrl(config)
    return {
      url: `${baseUrl}/api/v3/contents/generations/tasks/${taskId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status
    if (status === 'succeeded') {
      return {
        status: 'completed',
        videoUrl: result.video_url || result.content?.video_url || result.data?.video_url,
      }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result.error || 'Video generation failed' }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result.video_url || result.content?.video_url || result.data?.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    return Math.min(12, Math.max(4, parsed))
  }
}
