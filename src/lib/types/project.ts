/**
 * @file src/lib/types/project.ts
 * @description Shared project-level type definitions.
 * Import these instead of importing from FloorManagerDialog.svelte.
 */

export interface FloorConfig {
  number: number
  serverRoomCount: number
  roomNames?: Record<string, string> // e.g. { A: 'HR11-1', B: 'SER11' }
  label?: string // custom display label, e.g. "Penthouse"
}

export interface Project {
  id: string
  name: string
  description?: string
  floors: FloorConfig[]
  ownerId?: string
  deleted?: boolean
}
