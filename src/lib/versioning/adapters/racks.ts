import type { SnapshotAdapter, ViewPreset } from '$lib/types/versioning'
import type { RackDocData } from '../../../routes/projects/[pid]/racks/parts/types'

export const racksAdapter: SnapshotAdapter<RackDocData> = {
  toolType: 'racks',

  serialize(state: RackDocData): unknown {
    const { floor, room, rows, racks, devices, library, settings, roomObjects } = state
    return { floor, room, rows, racks, devices, library, settings, roomObjects }
  },

  validate(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return false
    const s = snapshot as Record<string, unknown>
    return Array.isArray(s.racks) && Array.isArray(s.devices)
  },

  defaultViewPresets(): ViewPreset[] {
    return [
      { name: 'Front Elevation', layers: { view: 'front' } },
      { name: 'Rear Elevation',  layers: { view: 'rear' } },
      { name: 'Plan View',       layers: { view: 'plan' } },
    ]
  },
}
