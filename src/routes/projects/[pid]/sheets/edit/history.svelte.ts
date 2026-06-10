/**
 * Snapshot-based undo/redo for a viewport's editors. One History per viewport covers the tool editor
 * AND its annotation peer as a single combined frame, so a group drag (which moves both) undoes as
 * one step. It's driven off the editors' change flow — `touch()` is called (debounced) after each
 * edit, coalescing a burst into one undo step — so there's no per-mutation wiring.
 *
 * Frames are JSON strings of each editor's `snapshot()`; undo/redo `seed()`s them back and `notify()`s
 * (which persists the restored state). `seed()` doesn't itself notify, so loading the doc never
 * records a step; `reset()` (re)baselines after a fresh seed from the source doc.
 */
interface Snapshotable { snapshot(): any; seed(s: any): void; notify(): void }

export class History {
	#eds: Snapshotable[] = []
	#undo: string[][] = []
	#redo: string[][] = []
	#base: string[] | null = null
	#restoring = false
	#t: ReturnType<typeof setTimeout> | null = null
	#delay: number
	#limit = 60
	canUndo = $state(false)
	canRedo = $state(false)

	constructor(delay = 500) { this.#delay = delay }

	/** Editors whose combined state forms one undo frame (order is stable: tool, then annotation). */
	register(...eds: Snapshotable[]) { this.#eds = eds }
	#capture(): string[] { return this.#eds.map(e => JSON.stringify(e.snapshot())) }
	#eq(a: string[], b: string[]) { return a.length === b.length && a.every((s, i) => s === b[i]) }
	#cancel() { if (this.#t) { clearTimeout(this.#t); this.#t = null } }
	#sync() { this.canUndo = this.#undo.length > 0; this.canRedo = this.#redo.length > 0 }

	/** (Re)baseline to the current state and clear history. Call after a (re)seed from the doc. */
	reset() { this.#cancel(); this.#base = this.#capture(); this.#undo = []; this.#redo = []; this.#sync() }

	/** Debounced commit: coalesce a burst of edits into a single undo step. */
	touch() {
		if (this.#restoring || !this.#base) return
		this.#cancel()
		this.#t = setTimeout(() => { this.#t = null; this.#commit() }, this.#delay)
	}
	#commit() {
		if (!this.#base) return
		const cur = this.#capture()
		if (this.#eq(cur, this.#base)) return
		this.#undo.push(this.#base)
		if (this.#undo.length > this.#limit) this.#undo.shift()
		this.#base = cur
		this.#redo = []
		this.#sync()
	}
	undo() {
		this.#cancel(); this.#commit() // flush any pending burst so the latest edit is undoable
		if (!this.#undo.length || !this.#base) return
		this.#redo.push(this.#base)
		this.#base = this.#undo.pop()!
		this.#apply(this.#base)
	}
	redo() {
		this.#cancel()
		if (!this.#redo.length || !this.#base) return
		this.#undo.push(this.#base)
		this.#base = this.#redo.pop()!
		this.#apply(this.#base)
	}
	#apply(frame: string[]) {
		this.#restoring = true
		this.#eds.forEach((e, i) => { if (frame[i] != null) { e.seed(JSON.parse(frame[i])); e.notify() } })
		this.#restoring = false
		this.#sync()
	}
}
