import type { SnapshotAdapter, ViewPreset } from '$lib/types/versioning'
import type { OutletsData } from '../../../routes/projects/[pid]/outlets/parts/types'

export const outletsAdapter: SnapshotAdapter<OutletsData> = {
  toolType: 'outlets',

  serialize(state: OutletsData): unknown {
    const { floor, outlets, trunks, routes, rackPlacements } = state
    return { floor, outlets, trunks, routes, rackPlacements }
  },

  validate(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return false
    const s = snapshot as Record<string, unknown>
    return Array.isArray(s.outlets)
  },

  defaultViewPresets(): ViewPreset[] {
    return [
      { name: 'Low Level IT Data Outlets', layers: { lowOutlets: true, highOutlets: false, lowTrunks: false, highTrunks: false } },
      { name: 'High Level Cable Routes and Outlets', layers: { lowOutlets: false, highOutlets: true, lowTrunks: false, highTrunks: true } },
      { name: 'Low Level IT Cable Routes', layers: { lowOutlets: false, highOutlets: false, lowTrunks: true, highTrunks: false } },
      { name: 'High Level Trunk Routes', layers: { lowOutlets: false, highOutlets: false, lowTrunks: false, highTrunks: true } },
    ]
  },
}
