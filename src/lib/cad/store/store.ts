// The entity store (ADR 0003): immutable records by id, ONE mutation path (transactions of ops), per-user undo.
// Pure TypeScript — the Svelte layer subscribes to it; persistence listens for committed ops. Nothing here mutates a
// record in place: `put` replaces it, so "has someone else changed this since?" is an identity check.
import type { Entity, EntityType } from '../domain/drawing'
import type { Id } from '../domain/types'

/** One change to one entity. `before` null = created, `after` null = deleted. */
export interface Op { id: Id; before: Entity | null; after: Entity | null }
/** `sel` = the selection before the edit (undo gives it back when nothing the step touched is left). */
export interface Step { label: string; ops: Op[]; sel?: Id[] }

export type ChangeSource = 'local' | 'gesture' | 'undo' | 'redo' | 'remote' | 'load'
/** `final` = the ops are settled and should be persisted (false while a gesture is still moving). */
export interface Change { source: ChangeSource; label?: string; ops: Op[]; final: boolean }
/** Does this change settle the data (a commit, undo, remote edit, or a rollback after its gesture ended) — rather than
 *  being one frame of a drag still moving? Readers that don't need the live drag wait for these (Q59). */
export const settles = (c: Change, busy: boolean): boolean => c.final || !busy

export interface Txn {
	get(id: Id): Entity | undefined
	put(e: Entity): void
	del(id: Id): void
}

export interface Gesture {
	/** Re-run the gesture's edit from its starting state (e.g. on every pointer move). */
	update(fn: (tx: Txn) => void): void
	/** `sel` = the selection before the gesture (see Step). */
	commit(sel?: Id[]): Step | null
	rollback(): void
}

export interface UndoResult { label: string; applied: Op[]; skipped: Op[]; sel?: Id[] }

export class EntityStore {
	#map = new Map<Id, Entity>()
	#undo: Step[] = []
	#redo: Step[] = []
	#listeners = new Set<(c: Change) => void>()
	#gesture: { label: string; base: Map<Id, Entity | null> } | null = null
	#freeze: boolean
	#maxUndo: number

	constructor(opts: { freeze?: boolean; maxUndo?: number } = {}) {
		this.#freeze = opts.freeze ?? true
		this.#maxUndo = opts.maxUndo ?? 200
	}

	// ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────────
	get(id: Id): Entity | undefined { return this.#map.get(id) }
	has(id: Id): boolean { return this.#map.has(id) }
	get size(): number { return this.#map.size }
	all(): Entity[] { return [...this.#map.values()] }
	ofType<T extends EntityType>(type: T): Extract<Entity, { type: T }>[] {
		const out: Extract<Entity, { type: T }>[] = []   // no copy of the whole map first (called in loops)
		for (const e of this.#map.values()) if (e.type === type) out.push(e as Extract<Entity, { type: T }>)
		return out
	}
	get canUndo(): boolean { return !this.readOnly && this.#undo.length > 0 }
	get canRedo(): boolean { return !this.readOnly && this.#redo.length > 0 }

	/** Set while someone else's restore runs (ADR 0008 §6): every local edit, undo and redo is refused with this
	 *  reason (`onRefuse` tells the user); other people's changes still arrive. */
	readOnly: string | null = null
	onRefuse: ((reason: string) => void) | null = null
	#refused(): boolean { if (this.readOnly) this.onRefuse?.(this.readOnly); return !!this.readOnly }

	/** Forget the undo / redo history — after someone else's restore, old steps would fight it. */
	clearHistory(): void { this.#undo = []; this.#redo = [] }
	get undoLabels(): string[] { return this.#undo.map((s) => s.label) }

	subscribe(cb: (c: Change) => void): () => void {
		this.#listeners.add(cb)
		return () => this.#listeners.delete(cb)
	}

	// ── Writing ─────────────────────────────────────────────────────────────────────────────────────────────────────

	/** Replace the whole contents (first load). Not undoable. */
	load(entities: Entity[]): void {
		const ops: Op[] = []
		for (const e of entities) { const f = this.#seal(e); ops.push({ id: e.id, before: this.#map.get(e.id) ?? null, after: f }); this.#map.set(e.id, f) }
		this.#emit({ source: 'load', ops, final: true })
	}

	/** One undoable edit. Returns the recorded step, or null when nothing changed. `sel` = the selection before it, for
	 *  undo to give back when nothing it touched is left (undoing a paste / copy). */
	transact(label: string, fn: (tx: Txn) => void, sel?: Id[]): Step | null {
		// mid-drag (async work that finishes while the mouse is down): it runs once the drag ends, on what's there then
		if (this.#gesture) { this.#afterGesture.push(() => this.transact(label, fn, sel)); return null }
		if (this.#refused()) return null
		const base = new Map<Id, Entity | null>()
		try { fn(this.#txn(base)); this.#derive(base) } catch (e) { this.#putBack(base); throw e }   // all or nothing: no half-made edit
		const ops = this.#settle(base)
		if (!ops.length) return null
		const step = { label, ops, ...(sel ? { sel } : {}) }
		this.#push(step)
		this.#emit({ source: 'local', label, ops, final: true })
		return step
	}

	/** A drag is open (begin … commit / rollback): undo / redo wait, and edits queue until it ends. */
	get busy(): boolean { return !!this.#gesture }
	#afterGesture: (() => void)[] = []
	#heldRemote = new Map<Id, Entity | null>()
	/** After a drag: other people's changes it held. Rolled back: all apply. Committed: those to what it changed are
	 *  dropped — the commit is written after them and wins on the server too. */
	#releaseRemote(changed: Set<Id>): void {
		if (!this.#heldRemote.size) return
		const held = [...this.#heldRemote].filter(([id]) => !changed.has(id))
		this.#heldRemote.clear()
		this.applyRemote(held.flatMap(([, e]) => (e ? [e] : [])), held.flatMap(([id, e]) => (e ? [] : [id])))
	}
	#flushAfterGesture(): void { const q = this.#afterGesture.splice(0); for (const f of q) f() }

	/** A drag: changes show live, one undo step on commit, Esc restores the start. */
	begin(label: string): Gesture {
		if (this.#gesture) throw new Error(`"${label}" started while the gesture "${this.#gesture.label}" is open`)
		if (this.#refused()) return { update: () => {}, commit: () => null, rollback: () => {} }
		const g = { label, base: new Map<Id, Entity | null>() }
		this.#gesture = g
		const restore = () => {
			const ops: Op[] = []
			for (const [id, was] of g.base) {
				const now = this.#map.get(id) ?? null
				if (now !== was) { ops.push({ id, before: now, after: was }); this.#write(id, was) }
			}
			return ops
		}
		return {
			update: (fn) => {
				if (this.#gesture !== g) throw new Error('This gesture has already ended')
				restore()
				try { fn(this.#txn(g.base)) } catch (e) { restore(); throw e }
				this.#emit({ source: 'gesture', label, ops: this.#settle(g.base, false), final: false })
			},
			commit: (sel) => {
				if (this.#gesture !== g) return null
				this.#gesture = null
				this.#derive(g.base)   // (on the drop, not each frame of the drag)
				const ops = this.#settle(g.base)
				let step: Step | null = null
				if (ops.length) {
					step = { label, ops, ...(sel ? { sel } : {}) }
					this.#push(step)
					this.#emit({ source: 'local', label, ops, final: true })
				}
				this.#releaseRemote(new Set(ops.map((o) => o.id)))
				this.#flushAfterGesture()
				return step
			},
			rollback: () => {
				if (this.#gesture !== g) return
				this.#gesture = null
				const ops = restore()
				if (ops.length) this.#emit({ source: 'gesture', label, ops, final: false })
				this.#releaseRemote(new Set())
				this.#flushAfterGesture()
			},
		}
	}

	/** Undo the last step. Ops whose entity someone else changed since are skipped, never overwritten. */
	undo(): UndoResult | null {
		if (this.#gesture || this.#refused()) return null   // mid-drag: the drag's restore would undo the undo
		const step = this.#undo.pop()
		if (!step) return null
		const res = this.#replay(step, 'undo')
		if (res.applied.length) this.#redo.push({ label: step.label, ops: res.applied })
		return step.sel ? { ...res, sel: step.sel } : res
	}

	redo(): UndoResult | null {
		if (this.#gesture || this.#refused()) return null
		const step = this.#redo.pop()
		if (!step) return null
		const res = this.#replay(step, 'redo')
		if (res.applied.length) this.#undo.push({ label: step.label, ops: res.applied })
		return res
	}

	/** Changes from other people. They never enter the undo history. One to something a drag is moving waits for the
	 *  drag to end (else the drag's next frame put its start back over it, and Esc lost it): `#releaseRemote`. */
	applyRemote(puts: Entity[], dels: Id[] = []): void {
		const g = this.#gesture
		if (g) {
			const held = (id: Id) => g.base.has(id)
			for (const e of puts) if (held(e.id)) this.#heldRemote.set(e.id, e)
			for (const id of dels) if (held(id)) this.#heldRemote.set(id, null)
			puts = puts.filter((e) => !held(e.id)); dels = dels.filter((id) => !held(id))
		}
		const ops: Op[] = []
		for (const e of puts) { const f = this.#seal(e); ops.push({ id: e.id, before: this.#map.get(e.id) ?? null, after: f }); this.#map.set(e.id, f) }
		for (const id of dels) { const was = this.#map.get(id); if (was) { ops.push({ id, before: was, after: null }); this.#map.delete(id) } }
		if (ops.length) this.#emit({ source: 'remote', ops, final: true })
	}

	// ── Internals ───────────────────────────────────────────────────────────────────────────────────────────────────

	/** Undo what a transaction wrote before it threw. */
	#putBack(base: Map<Id, Entity | null>): void { for (const [id, was] of base) this.#write(id, was) }

	#txn(base: Map<Id, Entity | null>): Txn {
		const touch = (id: Id) => { if (!base.has(id)) base.set(id, this.#map.get(id) ?? null) }
		return {
			get: (id) => this.#map.get(id),
			put: (e) => { touch(e.id); this.#write(e.id, this.#seal(e)) },
			del: (id) => { touch(id); this.#write(id, null) },
		}
	}

	/** The net ops of a transaction: first `before`, last `after`, untouched entities dropped. */
	/** What follows from an edit, written in the SAME step (one undo brings both back): set by the app — e.g. a cord's
	 *  estimated length when the racks it runs through change (User 2026-10-18). Runs on a local edit or a drag's drop,
	 *  never on undo / redo (the step already holds it) or another tab's edit (that tab wrote it). */
	derive: ((tx: Txn, ops: Op[]) => void) | null = null
	#derive(base: Map<Id, Entity | null>): void {
		const ops = this.derive ? this.#settle(base) : []
		if (ops.length) this.derive!(this.#txn(base), ops)
	}
	#settle(base: Map<Id, Entity | null>, _final = true): Op[] {
		const ops: Op[] = []
		for (const [id, before] of base) {
			const after = this.#map.get(id) ?? null
			// put back with the same values (a click on a device that didn't drag it): no change — no undo step, no save,
			// no "Move device" in the edit history (User 2026-10-18)
			if (before !== after && !(before && after && same(before, after))) ops.push({ id, before, after })
		}
		return ops
	}

	#replay(step: Step, source: 'undo' | 'redo'): UndoResult {
		const applied: Op[] = [], skipped: Op[] = []
		const ops = source === 'undo' ? [...step.ops].reverse() : step.ops
		for (const op of ops) {
			const expect = source === 'undo' ? op.after : op.before
			const target = source === 'undo' ? op.before : op.after
			const cur = this.#map.get(op.id) ?? null
			if (cur === expect) { this.#write(op.id, target); applied.push(op); continue }
			// someone else changed it since (Round 8: tab B's Undo was refused after tab A had added and undone a usage):
			// still fine when every FIELD this step changed holds what the step left — those go back, the rest stays theirs
			const merged = mergeBack(cur, expect, target)
			if (!merged) { skipped.push(op); continue }
			const out = this.#seal(merged)
			this.#write(op.id, out)
			// recorded as it really went (redo then expects this result)
			applied.push(source === 'undo' ? { id: op.id, before: out, after: cur } : { id: op.id, before: cur, after: out })
		}
		const emitted = applied.map((op) => (source === 'undo' ? { id: op.id, before: op.after, after: op.before } : op))
		if (emitted.length) this.#emit({ source, label: step.label, ops: emitted, final: true })
		return { label: step.label, applied, skipped }
	}

	#write(id: Id, e: Entity | null): void {
		if (e) this.#map.set(id, e)
		else this.#map.delete(id)
	}

	#push(step: Step): void {
		this.#undo.push(step)
		if (this.#undo.length > this.#maxUndo) this.#undo.shift()
		this.#redo = []
	}

	#emit(c: Change): void {
		for (const cb of this.#listeners) cb(c)
	}

	#seal<T extends Entity>(e: T): T {
		return this.#freeze ? deepFreeze(e) : e
	}
}

/** Field-level undo / redo over someone else's change: `cur` (now) with the fields that changed from `from` to `to` set
 *  back to `to` — only when each of those fields in `cur` still holds `from`'s value; null (skip it) when one doesn't,
 *  or when the entity was made or deleted by either side. */
export function mergeBack(cur: Entity | null, from: Entity | null, to: Entity | null): Entity | null {
	if (!cur || !from || !to) return null
	const a = from as unknown as Record<string, unknown>, b = to as unknown as Record<string, unknown>, c = cur as unknown as Record<string, unknown>
	const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k]))
	if (keys.some((k) => !same(c[k], a[k]))) return null
	const out: Record<string, unknown> = { ...c }
	for (const k of keys) { if (k in b) out[k] = b[k]; else delete out[k] }
	return out as unknown as Entity
}

/** Deep equality that ignores key order (a record back from the database may list its keys in another order). */
function same(x: unknown, y: unknown): boolean {
	if (x === y) return true
	if (!x || !y || typeof x !== 'object' || typeof y !== 'object' || Array.isArray(x) !== Array.isArray(y)) return false
	const a = x as Record<string, unknown>, b = y as Record<string, unknown>
	const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined)
	return ka.length === kb.length && ka.every((k) => same(a[k], b[k]))
}

/** Freeze a record and everything in it, so an accidental in-place edit throws instead of silently desyncing. */
export function deepFreeze<T>(v: T): T {
	if (v && typeof v === 'object' && !Object.isFrozen(v)) {
		Object.freeze(v)
		for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k])
	}
	return v
}
