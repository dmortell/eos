/**
 * @file src/lib/utils/floor.ts
 * @description Shared floor utilities: formatting, doc ID generation, data migration.
 * Centralises logic previously duplicated in Outlets.svelte, Racks.svelte,
 * Frames.svelte, and FloorManagerDialog.svelte.
 */

import type { FloorConfig } from '$lib/types/project'

// ---------------------------------------------------------------------------
// Floor label formatting
// ---------------------------------------------------------------------------

/**
 * Format a floor number for display using the project's floor format setting.
 * Uses the custom label from FloorConfig if one is set.
 *
 * @param fl          Floor number (negative numbers = basements)
 * @param floorFormat Format style: 'L01' (default) | '01F' | '01'
 * @param floors      Floor config array for custom label lookup
 */
export function fmtFloor(
  fl: number,
  floorFormat: string = 'L01',
  floors: FloorConfig[] = [],
): string {
  const cfg = floors.find((f) => f.number === fl)
  if (cfg?.label) return cfg.label

  if (fl < 0) {
    const n = String(Math.abs(fl)).padStart(2, '0')
    if (floorFormat === '01F') return `B${Math.abs(fl)}F`
    return `B${n}` // covers both '01' and 'L01' (basement)
  }

  const n = String(fl).padStart(2, '0')
  if (floorFormat === '01F') return `${n}F`
  if (floorFormat === '01') return n
  return `L${n}`
}

// ---------------------------------------------------------------------------
// Firestore doc ID helpers
// ---------------------------------------------------------------------------

/**
 * Build a Firestore document ID for a floor-scoped tool document.
 * Pattern: `{projectId}_F{floor}` e.g. `abc123_F01`
 */
export function floorDocId(projectId: string, floor: number): string {
  return `${projectId}_F${String(floor).padStart(2, '0')}`
}

/**
 * Build a Firestore document ID for a floor + room-scoped document.
 * Pattern: `{projectId}_F{floor}_R{room}` e.g. `abc123_F01_RA`
 */
export function roomDocId(projectId: string, floor: number, room: string): string {
  return `${floorDocId(projectId, floor)}_R${room}`
}

// ---------------------------------------------------------------------------
// Data migration
// ---------------------------------------------------------------------------

/**
 * Migrate legacy floors format from a plain number array to FloorConfig objects.
 * Safely handles null/undefined, already-migrated arrays, and legacy number arrays.
 *
 * @example
 * migrateFloors([1, 2, 3])
 * // → [{ number: 1, serverRoomCount: 1 }, ...]
 *
 * migrateFloors([{ number: 1, serverRoomCount: 2 }])
 * // → [{ number: 1, serverRoomCount: 2 }]  (unchanged)
 */
export function migrateFloors(raw: unknown): FloorConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ number: 1, serverRoomCount: 1 }]
  }
  if (typeof raw[0] === 'object' && raw[0] !== null && 'number' in raw[0]) {
    return raw as FloorConfig[]
  }
  return (raw as number[]).map((n) => ({ number: n, serverRoomCount: 1 }))
}
