// The user's own layer settings (ADR 0003, docs/plan/layers.md): which layers they've hidden or locked and the current
// layer. Per user and per project, kept in this browser — never on the data, so nobody else's view changes. Sheets
// don't use these: a viewport's freeze is stored on the sheet (what prints is the same for everyone).
import type { Id } from '../domain/types'

interface Saved { hidden?: Id[]; locked?: Id[]; current?: Id | null }

export class LayerPrefs {
	/** Replaced wholesale, never mutated ($state.raw). */
	hidden = $state.raw<ReadonlySet<Id>>(new Set())
	locked = $state.raw<ReadonlySet<Id>>(new Set())
	/** Where new lines, notes and blocks go (null = each kind's own layer). Walls, trunks, outlets, racks always go to
	 *  their system layer (Dave, layers.md Q3). */
	current = $state<Id | null>(null)
	#key = ''

	load(pid: string): void {
		this.#key = `cad-layers:${pid}`
		try {
			const s = JSON.parse(localStorage.getItem(this.#key) ?? '{}') as Saved
			this.hidden = new Set(s.hidden ?? [])
			this.locked = new Set(s.locked ?? [])
			this.current = s.current ?? null
		} catch { /* nothing saved, or storage blocked: start with everything shown */ }
	}
	#save(): void {
		try { localStorage.setItem(this.#key, JSON.stringify({ hidden: [...this.hidden], locked: [...this.locked], current: this.current })) } catch { /* storage blocked */ }
	}
	#flip(set: ReadonlySet<Id>, id: Id): Set<Id> {
		const s = new Set(set)
		if (!s.delete(id)) s.add(id)
		return s
	}

	toggleHidden(id: Id): void { this.hidden = this.#flip(this.hidden, id); this.#save() }
	toggleLocked(id: Id): void { this.locked = this.#flip(this.locked, id); this.#save() }
	setCurrent(id: Id | null): void { this.current = id; this.#save() }
	/** A deleted layer leaves no trace in the settings. */
	forget(id: Id): void {
		const h = new Set(this.hidden), l = new Set(this.locked)
		h.delete(id); l.delete(id)
		this.hidden = h; this.locked = l
		if (this.current === id) this.current = null
		this.#save()
	}
}
