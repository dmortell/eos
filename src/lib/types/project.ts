/**
 * @file src/lib/types/project.ts
 * @description Shared project-level type definitions.
 * Import these instead of importing from FloorManagerDialog.svelte.
 */

/** A tenant space / suite on a floor — lets two leased areas share one physical
 *  floor (and one riser band) while keeping separate per-floor tool data. */
export interface FloorArea {
  id: string
  label: string
}

export interface FloorConfig {
  number: number
  serverRoomCount: number
  roomNames?: Record<string, string> // e.g. { A: 'HR11-1', B: 'SER11' }
  label?: string // custom display label, e.g. "Penthouse"
  /** Tenant spaces on this floor. When present, per-floor tool docs are keyed
   *  per area (`${pid}_F{NN}__{areaId}`); absent → one implicit area (legacy
   *  unsuffixed key). */
  areas?: FloorArea[]
}

export interface Project {
  id: string
  name: string
  description?: string
  floors: FloorConfig[]
  ownerId?: string
  deleted?: boolean
}
