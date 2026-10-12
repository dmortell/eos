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
