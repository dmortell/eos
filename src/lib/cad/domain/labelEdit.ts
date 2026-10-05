// EDIT A LABEL IN PLACE (backlog "Edit a label in place", Dave 2026-10-05): which things have words that can be typed
// over on the drawing — an outlet's label (its ports follow), a rack's name, a run's label, a text, a leader's words —
// what they are now, and the thing with new words. Pure.
import type { Entity } from './drawing'
import type { Outlet, Rack } from './types'
import type { Shape } from './shapes'
import { renameOutlet } from './ports'

/** Which family it belongs to: Tab moves between things of the same one. */
export type LabelKind = 'outlet' | 'rack' | 'run' | 'text'

export function labelKind(e: Entity | undefined): LabelKind | null {
	if (e?.type === 'outlet') return 'outlet'
	if (e?.type === 'rack') return 'rack'
	if (e?.type !== 'shape') return null
	if (e.geom.kind === 'text' || e.geom.kind === 'leader') return 'text'
	return e.geom.kind === 'path' ? 'run' : null
}

/** Its words now ('' = none yet). */
export function labelOf(e: Entity): string {
	if (e.type === 'outlet') return (e as Outlet).label
	if (e.type === 'rack') return (e as Rack).name
	if (e.type !== 'shape') return ''
	const g = (e as Shape).geom
	return g.kind === 'text' ? g.text : g.kind === 'leader' ? (g.text ?? '') : ((e as Shape).label ?? '')
}

/** The thing with new words; null = not allowed (a text, outlet or rack can't be blank) or unchanged. */
export function withLabel(e: Entity, next: string): Entity | null {
	const t = next.replace(/\s+$/, '')
	if (t === labelOf(e)) return null
	if (e.type === 'outlet') return t.trim() ? renameOutlet(e as Outlet, t.trim()) : null
	if (e.type === 'rack') return t.trim() ? { ...(e as Rack), name: t.trim() } : null
	if (e.type !== 'shape') return null
	const s = e as Shape, g = s.geom
	if (g.kind === 'text') return t ? { ...s, geom: { ...g, text: t } } : null
	if (g.kind === 'leader') return { ...s, geom: { ...g, text: t || undefined } }
	return { ...s, label: t.trim() || undefined }
}
