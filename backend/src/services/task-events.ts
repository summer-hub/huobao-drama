/**
 * 任务事件总线（进程内 SSE 推送）
 * 提供 emit / on / off 接口
 */
import { EventEmitter } from 'events'

class TaskEventBus extends EventEmitter {
  emitTaskEvent(taskId: number, event: string, data?: any) {
    this.emit(`task:${taskId}`, { event, data, ts: new Date().toISOString() })
  }

  onTask(taskId: number, handler: (payload: any) => void) {
    this.on(`task:${taskId}`, handler)
  }

  offTask(taskId: number, handler: (payload: any) => void) {
    this.off(`task:${taskId}`, handler)
  }
}

// 全局单例
export const taskEvents = new TaskEventBus()
taskEvents.setMaxListeners(200)
