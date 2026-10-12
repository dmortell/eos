// The Properties FIELD KIT: one meaning of "the value several items share", one MIXED word, one undo step per edit,
// and the parsers every field uses. The field components (ui/fields/) and the per-kind Props components use these
// instead of their own copies. Pure; tested in propsKit.test.ts.
import type { Entity } from '../domain/drawing'
import type { Txn } from '../store/store'

/** What a field shows when the selected items disagree (placeholder, or a disabled select option). */
export const MIXED = 'mixed'

/** The value every item shares, or `mixed` when they differ (`value` is then undefined). An empty list is not mixed. */
export interface Shared<V> { value: V | undefined; mixed: boolean }

export function shared<T, V>(list: readonly T[], f: (t: T) => V): Shared<V> {
	if (!list.length) return { value: undefined, mixed: false }
	const v = f(list[0])
	for (let i = 1; i < list.length; i++) if (f(list[i]) !== v) return { value: undefined, mixed: true }
	return { value: v, mixed: false }
}

/** "3 racks · 5 outlets": a count per kind, in the order given; one kind of one thing is just its name. */
export function countsText(counts: readonly (readonly [number, string, string?])[]): string {
	return counts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`).join(' · ')
}

/** One kind of thing in a selection, for Properties (a group each) and its header ("3 racks · 5 outlets"). */
export interface SelKind { key: 'outlet' | 'rack' | 'device' | 'cord' | 'sheet' | 'run' | 'shape' | 'other'; one: string; many: string; items: Entity[] }

/** The selection split by kind, in a fixed order. Runs and lines (paths) are one kind, the other drawn shapes another
 *  (named "blocks" / "texts" when they are all that). */
export function selectionKinds(items: readonly Entity[]): SelKind[] {
	const by = new Map<SelKind['key'], Entity[]>()
	for (const e of items) {
		const k: SelKind['key'] = e.type === 'outlet' || e.type === 'rack' || e.type === 'device' || e.type === 'cord' || e.type === 'sheet' ? e.type
			: e.type === 'shape' ? (e.geom.kind === 'path' ? 'run' : 'shape') : 'other'
		by.set(k, [...(by.get(k) ?? []), e])
	}
	const ORDER: SelKind['key'][] = ['outlet', 'rack', 'device', 'cord', 'sheet', 'run', 'shape', 'other']
	return ORDER.filter((k) => by.has(k)).map((key) => {
		const list = by.get(key)!
		const shapes = list.filter((e) => e.type === 'shape')
		const [one, many] = key === 'run' ? (shapes.every((s) => !s.role) ? ['line', 'lines'] : shapes.every((s) => s.role?.kind === 'wall') ? ['wall', 'walls'] : ['run', 'runs'])
			: key === 'shape' ? (shapes.every((s) => s.geom.kind === 'insert') ? ['block', 'blocks'] : shapes.every((s) => s.geom.kind === 'text') ? ['text', 'texts'] : ['shape', 'shapes'])
			: key === 'cord' ? ['patch cord', 'patch cords'] : key === 'other' ? ['item', 'items'] : [key, `${key}s`]
		return { key, one, many, items: list }
	})
}

const KIND: Record<string, [string, string]> = {
	outlet: ['Outlet', 'circleDot'], rack: ['Rack', 'server'], device: ['Device', 'pcCase'], sheet: ['Sheet', 'fileText'], cord: ['Patch cord', 'cable'],
	section: ['Section', 'scan'], link: ['Cable', 'cable'], space: ['Room', 'home'], rackRow: ['Row of racks', 'rows'], level: ['Level', 'layers'],
}
const SHAPE: Record<string, [string, string]> = {
	wall: ['Wall', 'brickWall'], containment: ['Run', 'route'], opening: ['Opening', 'opening'], riser: ['Riser', 'route'], penetration: ['Penetration', 'opening'],
	path: ['Line', 'k-line'], rect: ['Rectangle', 'rect'], ellipse: ['Ellipse', 'ellipse'], circle: ['Circle', 'ellipse'], polygon: ['Polygon', 'polygon'],
	text: ['Text', 'k-text'], leader: ['Leader', 'callout'], cloud: ['Cloud', 'highlighter'], dimension: ['Dimension', 'ruler'], legend: ['Legend', 'list'], insert: ['Block', 'package'], image: ['Image', 'image'],
}
/** What one thing is called, and its icon — the Properties header's word, also used by messages about it ("Deleted
 *  trunk T1"), so a thing has one name everywhere. */
export function kindOf(e: Entity): [string, string] {
	if (e.type === 'space' && e.kind === 'server room') return ['Server room', 'server']
	if (e.type === 'shape') {
		const r = e.role?.kind === 'containment' ? (e.role.form === 'conduit' ? ['Conduit', 'rows'] : ['Trunk', 'route']) as [string, string] : undefined
		return r ?? SHAPE[e.role?.kind ?? ''] ?? (e.extent ? ['Box', 'box'] : SHAPE[e.geom.kind] ?? [e.geom.kind, 'rect'])
	}
	return KIND[e.type] ?? [e.type, 'rect']
}
/** The icon for a kind of thing by its type ("rack"), for a header over several. */
export const kindIcon = (type: string): string | undefined => KIND[type]?.[1]

/** The store as the kit needs it (CadProject.store). */
export interface PutStore { transact(label: string, fn: (tx: Txn) => void): unknown }

/** One item changed: one undo step. */
export function put<T extends Entity>(store: PutStore, e: T, label: string, patch: Partial<T>): void {
	store.transact(label, (tx) => tx.put({ ...e, ...patch } as Entity))
}

/** Several items changed the same way: ONE undo step, labelled "Label (3 racks)" when there are several. The patch may
 *  depend on each item; null leaves that one alone. */
export function putMany<T extends Entity>(store: PutStore, list: readonly T[], label: string, patch: Partial<T> | ((e: T) => Partial<T> | null), noun = 'items'): void {
	if (!list.length) return
	const f = typeof patch === 'function' ? patch : () => patch
	store.transact(list.length > 1 ? `${label} (${list.length} ${noun})` : label, (tx) => {
		for (const e of list) { const p = f(e); if (p) tx.put({ ...e, ...p } as Entity) }
	})
}

/** A typed number; blank = undefined (the default), not a number = null (refused). */
export function num(v: string): number | undefined | null {
	if (v.trim() === '') return undefined
	const n = Number(v)
	return Number.isFinite(n) ? n : null
}

/** Typed text, trimmed; blank = undefined. */
export const text = (v: string): string | undefined => v.trim() || undefined

/** A whole number ≥ min, else null (refused). */
export function whole(v: string, min: number): number | null {
	const n = Number(v)
	return v.trim() !== '' && Number.isInteger(n) && n >= min ? n : null
}
