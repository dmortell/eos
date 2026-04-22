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
      { name: 'Front Elevation', layers: { front: true, rear: false, plan: false } },
      { name: 'Rear Elevation', layers: { front: false, rear: true, plan: false } },
      { name: 'Plan View', layers: { front: false, rear: false, plan: true } },
      { name: 'Elevations + Plan', layers: { front: true, rear: true, plan: true } },
    ]
  },
}
