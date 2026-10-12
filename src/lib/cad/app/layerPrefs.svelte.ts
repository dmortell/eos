// The user's own layer settings (ADR 0003, docs/plan/layers.md): which layers they've hidden or locked and the current
// layer. Per user and per project, kept in this browser — never on the data, so nobody else's view changes. Sheets
// don't use these: a viewport's freeze is stored on the sheet (what prints is the same for everyone).
import type { Id } from '../domain/types'
import { withPreset, type LayerPreset } from '../domain/layers'

interface Saved { hidden?: Id[]; locked?: Id[]; current?: Id | null; presets?: LayerPreset[] }

export class LayerPrefs {
	/** Replaced wholesale, never mutated ($state.raw). */
	hidden = $state.raw<ReadonlySet<Id>>(new Set())
	locked = $state.raw<ReadonlySet<Id>>(new Set())
	/** Where new lines, notes and blocks go (null = each kind's own layer). Walls, trunks, outlets, racks always go to
	 *  their system layer (Dave, layers.md Q3). */
	current = $state<Id | null>(null)
	/** Saved sets of shown layers (Layers → presets), replaced wholesale. */
	presets = $state.raw<LayerPreset[]>([])
	#key = ''

	load(pid: string): void {
		this.#key = `cad-layers:${pid}`
		try {
			const s = JSON.parse(localStorage.getItem(this.#key) ?? '{}') as Saved
			this.hidden = new Set(s.hidden ?? [])
			this.locked = new Set(s.locked ?? [])
			this.current = s.current ?? null
			this.presets = (s.presets ?? []).filter((p) => p && typeof p.name === 'string' && Array.isArray(p.hidden))
		} catch { /* nothing saved, or storage blocked: start with everything shown */ }
	}
	#save(): void {
		try { localStorage.setItem(this.#key, JSON.stringify({ hidden: [...this.hidden], locked: [...this.locked], current: this.current, presets: this.presets })) } catch { /* storage blocked */ }
	}
	#flip(set: ReadonlySet<Id>, id: Id): Set<Id> {
		const s = new Set(set)
		if (!s.delete(id)) s.add(id)
		return s
	}

	toggleHidden(id: Id): void { this.hidden = this.#flip(this.hidden, id); this.#save() }
	toggleLocked(id: Id): void { this.locked = this.#flip(this.locked, id); this.#save() }
	/** Several layers at once (a group's eye, a multi-selection): all hidden or all shown. */
	setHidden(ids: Id[], hide: boolean): void { this.hidden = this.#many(this.hidden, ids, hide); this.#save() }
	setLocked(ids: Id[], lock: boolean): void { this.locked = this.#many(this.locked, ids, lock); this.#save() }
	#many(set: ReadonlySet<Id>, ids: Id[], on: boolean): Set<Id> {
		const s = new Set(set)
		for (const id of ids) { if (on) s.add(id); else s.delete(id) }
		return s
	}
	/** Save the current eye states under a name (a same-named preset is replaced). */
	savePreset(name: string): void { this.presets = withPreset(this.presets, name, this.hidden); this.#save() }
	/** Show exactly what the preset showed (layers made since stay shown); returns the layers it hid. */
	applyPreset(name: string): Id[] {
		const p = this.presets.find((x) => x.name === name)
		if (!p) return []
		this.hidden = new Set(p.hidden)
		this.#save()
		return p.hidden
	}
	deletePreset(name: string): void { this.presets = this.presets.filter((p) => p.name !== name); this.#save() }
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
