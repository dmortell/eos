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
  /** This area owns the floor's legacy unsuffixed doc key (`${pid}_F{NN}`).
   *  Set once at creation (the first area inherits the floor's existing data);
   *  IMMUTABLE thereafter so an area's data never moves out from under it. At
   *  most one area per floor. Absent → keyed by id (`${pid}_F{NN}__{id}`). When
   *  no area on the floor has it set, the first area is treated as legacy
   *  (back-compat). */
  legacy?: boolean
  /** The default / featured space (which area opens first). Purely cosmetic and
   *  freely editable — does NOT affect the doc key, so re-assigning it (e.g. a
   *  tenant moving offices) never moves data. At most one area per floor. */
  primary?: boolean
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
