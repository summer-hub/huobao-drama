/**
 * Drama 全局状态管理
 * 管理当前选中的 drama 和 episodes 列表
 */
import { defineStore } from 'pinia'

export interface Drama {
  id: number
  title: string
  description?: string
  genre?: string
  style?: string
  status?: string
  tags?: string[]
  total_episodes?: number
  episodes?: Episode[]
  characters?: Character[]
  scenes?: Scene[]
}

export interface Episode {
  id: number
  drama_id: number
  episode_number: number
  title: string
  content?: string
  script_content?: string
  status?: string
}

export interface Character {
  id: number
  drama_id: number
  name: string
  role?: string
  description?: string
  appearance?: string
  personality?: string
  voice_style?: string
  image_url?: string
}

export interface Scene {
  id: number
  drama_id: number
  location: string
  time: string
  prompt: string
  status?: string
  image_url?: string
}

export const useDramaStore = defineStore('drama', () => {
  // 当前选中的 drama
  const currentDrama = ref<Drama | null>(null)

  // 当前集号（用于 episode 页面）
  const currentEpisodeNumber = ref<number>(1)

  // 加载状态
  const loading = ref(false)

  // 设置当前 drama
  function setDrama(drama: Drama) {
    currentDrama.value = drama
  }

  // 清除当前 drama
  function clearDrama() {
    currentDrama.value = null
    currentEpisodeNumber.value = 1
  }

  // 更新 drama 字段
  function updateDrama(updates: Partial<Drama>) {
    if (currentDrama.value) {
      currentDrama.value = { ...currentDrama.value, ...updates }
    }
  }

  // 设置当前集号
  function setEpisodeNumber(num: number) {
    currentEpisodeNumber.value = num
  }

  return {
    currentDrama,
    currentEpisodeNumber,
    loading,
    setDrama,
    clearDrama,
    updateDrama,
    setEpisodeNumber,
  }
})
