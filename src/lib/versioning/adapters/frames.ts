import type { SnapshotAdapter, ViewPreset } from '$lib/types/versioning'
import type { ZoneConfig, FrameConfig } from '../../../routes/projects/[pid]/frames/parts/types'

interface FramesDocData {
  floor: number
  zones: ZoneConfig[]
  frames: FrameConfig[]
  rooms: Record<string, string>
  customLocationTypes?: string[]
}

export const framesAdapter: SnapshotAdapter<FramesDocData> = {
  toolType: 'frames',

  serialize(state: FramesDocData): unknown {
    const { floor, zones, frames, rooms, customLocationTypes } = state
    return { floor, zones, frames, rooms, customLocationTypes }
  },

  validate(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return false
    const s = snapshot as Record<string, unknown>
    return Array.isArray(s.zones) && Array.isArray(s.frames)
  },

  defaultViewPresets(): ViewPreset[] {
    return [
      { name: 'Patch Frame Layout', layers: { default: true } },
    ]
  },
}
