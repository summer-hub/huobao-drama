/**
 * ChatFire TTS Adapter
 * ChatFire 音频服务实际调用 MiniMax API，但 baseUrl 需要加 /minimax 路径
 * API: POST /v1/t2a_v2
 */
import type { TTSProviderAdapter } from './types'

export interface TTSParams {
  text: string
  voice: string
  speed?: number
  model?: string
  emotion?: string
}

export interface TTSResult {
  audioHex: string
  audioLength: number
  sampleRate: number
  bitrate: number
  format: string
  channel: number
}

export class ChatFireTTSAdapter implements TTSProviderAdapter {
  readonly provider = 'chatfire'

  buildGenerateRequest(config: any, params: TTSParams): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    // ChatFire 音频实际在 /minimax 路径下
    let baseUrl = (config.baseUrl || '').replace(/\/+$/, '')
    if (!baseUrl.endsWith('/minimax')) {
      baseUrl = `${baseUrl}/minimax`
    }

    const url = `${baseUrl}/v1/t2a_v2`

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }

    const body: any = {
      model: params.model || 'speech-2.8-hd',
      text: params.text,
      stream: false,
      voice_setting: {
        voice_id: params.voice,
        speed: params.speed ?? 1,
        vol: 1,
        pitch: 0,
        emotion: params.emotion || 'happy',
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
      subtitle_enable: false,
    }

    return { url, method: 'POST', headers, body }
  }

  parseResponse(result: any): TTSResult {
    if (result.base_resp?.status_code !== 0) {
      throw new Error(result.base_resp?.status_msg || 'TTS generation failed')
    }

    const data = result.data
    if (!data?.audio) {
      throw new Error('No audio data in response')
    }

    return {
      audioHex: data.audio,
      audioLength: data.extra_info?.audio_length || 0,
      sampleRate: data.extra_info?.audio_sample_rate || 32000,
      bitrate: data.extra_info?.bitrate || 128000,
      format: data.extra_info?.audio_format || 'mp3',
      channel: data.extra_info?.audio_channel || 1,
    }
  }
}
