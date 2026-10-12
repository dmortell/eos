// Entity ⇄ Firestore doc (ADR 0003). One doc per entity in `projects/{pid}/cadEntities/{id}`, plus:
//  - `scope`: what a client subscribes by — `level:<id>`, `view:<id>`, `sheet:<id>` or `project`;
//  - `rev` / `updatedAt` / `updatedBy` / `client`: echo detection and audit. These never enter the store's records.
//    `client` names the browser tab that wrote it (one user can have several tabs / sessions open), so a change can
//    be traced to where it came from.
import type { Entity } from '../domain/drawing'
import type { Id } from '../domain/types'

export interface Meta { rev: number; updatedAt: number; updatedBy: string; client?: string }
export type StoredDoc = Record<string, unknown> & { id: Id; type: string; scope: string } & Meta

export const PROJECT_SCOPE = 'project'
export const levelScope = (id: Id) => `level:${id}`
export const viewScope = (id: Id) => `view:${id}`
export const sheetScope = (id: Id) => `sheet:${id}`

/**
 * Which listener loads an entity. Things on a floor plan load with their level; shapes with their owner; everything
 * the tree, panels and grids need project-wide (levels, spaces, racks, devices, links, cords, views, sheets …) loads
 * once with the project.
 */
export function scopeOf(e: Entity): string {
	switch (e.type) {
		case 'shape':
			if (e.levelId) return levelScope(e.levelId)
			if (e.viewId) return viewScope(e.viewId)
			if (e.sheetId) return sheetScope(e.sheetId)
			throw new Error(`shape ${e.id} has no owner (levelId / viewId / sheetId) - it would be saved to a scope nobody loads`)
		case 'outlet':
		case 'underlay':
			return levelScope(e.levelId)
		default:
			return PROJECT_SCOPE
	}
}

const META_KEYS = new Set(['scope', 'rev', 'updatedAt', 'updatedBy', 'client'])

/** Firestore rejects `undefined`; drop it at every depth. (Arrays of arrays are already ruled out by the schema.) */
export function stripUndefined<T>(v: T): T {
	if (Array.isArray(v)) return v.map(stripUndefined) as T
	if (v && typeof v === 'object') {
		const out: Record<string, unknown> = {}
		for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = stripUndefined(x)
		return out as T
	}
	return v
}

export function toDoc(e: Entity, meta: Meta): StoredDoc {
	return { ...stripUndefined(e as unknown as Record<string, unknown>), scope: scopeOf(e), ...meta } as StoredDoc
}

/** A stored doc as an entity, or null (with a console warning) when it isn't one: not an object, no string id / type, or
 *  no numeric rev. Firestore data is whatever any client or script wrote; a bad doc is skipped instead of entering the
 *  store (where it would throw in the first view that reads it). */
export function fromDoc(d: StoredDoc): { entity: Entity; meta: Meta } | null {
	const bad = !d || typeof d !== 'object' ? 'not an object' : typeof d.id !== 'string' || !d.id ? 'no id' : typeof d.type !== 'string' || !d.type ? 'no type' : typeof d.rev !== 'number' ? 'no rev' : null
	if (bad) { console.warn(`cad: skipping a bad cadEntities doc (${bad})`, d?.id ?? d); return null }
	const entity: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(d)) if (!META_KEYS.has(k)) entity[k] = v
	return { entity: entity as unknown as Entity, meta: { rev: d.rev, updatedAt: d.updatedAt, updatedBy: d.updatedBy, ...(d.client ? { client: String(d.client) } : {}) } }
}
